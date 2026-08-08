import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { WechatAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { getRedisSyncMsg, httpSyncMsg } from './pad/message.js';
import { getPadOnlineStatus } from './pad/status.js';
import type { ParsedPadMessage } from './pad/types.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatInboundService } from './wechat-inbound.service.js';
import { WechatReplyGateService } from './wechat-reply-gate.service.js';

const EMPTY_POLL_MS = 2_000;
const RETRY_DELAY_MS = 3_000;
const BACKOFF_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const ONLINE_CHECK_EVERY = 30;
const SEEN_CAP = 3_000;
const SEEN_PERSIST_DEBOUNCE_MS = 2_000;

/**
 * v875 入站：
 * - 优先 GetRedisSyncMsg（实测 AddMsgs 在这里）
 * - HttpSyncMsg 作补充（文档队列，当前常为空）
 * - 按 msgId 去重；首次快照只记位点、不回放历史
 * - seen / bootstrapped 落库，进程重启可续接
 */
@Injectable()
export class WechatMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechatMonitorService.name);
  private readonly abortByAccount = new Map<string, AbortController>();
  private readonly seenByAccount = new Map<string, Set<string>>();
  private readonly bootstrapped = new Set<string>();
  private readonly hydrated = new Set<string>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly inbound: WechatInboundService,
    private readonly prisma: PrismaService,
    private readonly replyGate: WechatReplyGateService,
  ) {}

  async onModuleInit() {
    this.running = true;
    await this.reload();
  }

  onModuleDestroy() {
    this.running = false;
    for (const controller of this.abortByAccount.values()) {
      controller.abort();
    }
    this.abortByAccount.clear();
    for (const timer of this.persistTimers.values()) {
      clearTimeout(timer);
    }
    this.persistTimers.clear();
  }

  async reload() {
    const enabled = await this.accounts.findEnabled();
    const enabledIds = new Set(enabled.map((row) => row.id));

    for (const [id, controller] of this.abortByAccount) {
      if (!enabledIds.has(id)) {
        controller.abort();
        this.abortByAccount.delete(id);
        this.seenByAccount.delete(id);
        this.bootstrapped.delete(id);
        this.hydrated.delete(id);
        const timer = this.persistTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.persistTimers.delete(id);
        }
      }
    }

    for (const row of enabled) {
      if (this.abortByAccount.has(row.id)) continue;
      const controller = new AbortController();
      this.abortByAccount.set(row.id, controller);
      void this.loopAccount(row, controller.signal);
    }

    this.logger.log(`微信监控已同步，活跃账号 ${enabled.length} 个`);
  }

  private async loopAccount(seed: WechatAccount, abortSignal: AbortSignal) {
    let consecutiveFailures = 0;
    let pollCount = 0;

    this.logger.log(
      `微信监控启动 wxid=${seed.wxid} agent=${seed.agentId} user=${seed.userId}`,
    );

    while (this.running && !abortSignal.aborted) {
      const row = await this.accounts.findById(seed.id);
      if (!row || !row.enabled) break;

      this.replyGate.hydrateFromRow(row.id, row.autoReplyPaused);

      try {
        if (pollCount % ONLINE_CHECK_EVERY === 0) {
          const status = await getPadOnlineStatus(row.authKey);
          if (!status.online) {
            this.logger.warn(
              `wxid=${row.wxid} ${status.message}；请重新扫码绑定。轮询将继续尝试。`,
            );
          } else if (pollCount === 0) {
            this.logger.log(`wxid=${row.wxid} 在线检测通过`);
          }
        }
        pollCount += 1;

        const messages = await this.pullMessages(
          row.authKey,
          abortSignal,
          pollCount,
        );
        consecutiveFailures = 0;

        const fresh = await this.filterNewMessages(row.id, messages);
        if (fresh.length === 0) {
          await this.sleep(EMPTY_POLL_MS, abortSignal);
          continue;
        }

        this.logger.log(
          `拉取到 ${fresh.length} 条新消息 wxid=${row.wxid}`,
        );
        for (const msg of fresh) {
          await this.inbound.handleParsed(row, msg);
        }
      } catch (error) {
        if (abortSignal.aborted) break;
        consecutiveFailures += 1;
        this.logger.error(
          `微信轮询异常 wxid=${seed.wxid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await this.sleep(
          consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
            ? BACKOFF_DELAY_MS
            : RETRY_DELAY_MS,
          abortSignal,
        );
      }
    }

    this.logger.log(`微信监控停止 wxid=${seed.wxid}`);
  }

  private async pullMessages(
    authKey: string,
    abortSignal: AbortSignal,
    pollCount: number,
  ): Promise<ParsedPadMessage[]> {
    const byId = new Map<string, ParsedPadMessage>();

    const fromRedis = await getRedisSyncMsg(authKey, abortSignal);
    for (const msg of fromRedis) {
      byId.set(this.messageKey(msg), msg);
    }

    if (pollCount % 15 === 1) {
      try {
        const fromHttp = await httpSyncMsg(authKey, 20, abortSignal);
        for (const msg of fromHttp) {
          byId.set(this.messageKey(msg), msg);
        }
      } catch {
        // ignore
      }
    }

    return [...byId.values()];
  }

  private async ensureHydrated(accountId: string) {
    if (this.hydrated.has(accountId)) return;

    const row = await this.prisma.wechatAccount.findUnique({
      where: { id: accountId },
      select: {
        syncBootstrapped: true,
        syncSeenMsgIds: true,
      },
    });

    const seen = new Set<string>();
    const ids = parseSeenMsgIds(row?.syncSeenMsgIds);
    for (const id of ids) seen.add(id);
    this.seenByAccount.set(accountId, seen);

    if (row?.syncBootstrapped) {
      this.bootstrapped.add(accountId);
      this.logger.log(
        `入站位点已从数据库恢复 account=${accountId} seen=${seen.size}`,
      );
    }

    this.hydrated.add(accountId);
  }

  private async filterNewMessages(
    accountId: string,
    messages: ParsedPadMessage[],
  ): Promise<ParsedPadMessage[]> {
    await this.ensureHydrated(accountId);

    let seen = this.seenByAccount.get(accountId);
    if (!seen) {
      seen = new Set<string>();
      this.seenByAccount.set(accountId, seen);
    }

    // 首次只建立位点，避免上线瞬间回放历史系统消息
    if (!this.bootstrapped.has(accountId)) {
      for (const msg of messages) {
        seen.add(this.messageKey(msg));
      }
      this.trimSeen(seen);
      this.bootstrapped.add(accountId);
      await this.persistSyncState(accountId, seen, true);
      this.logger.log(
        `入站位点已建立 account=${accountId} seen=${seen.size}（历史不回放）`,
      );
      return [];
    }

    const fresh: ParsedPadMessage[] = [];
    let changed = false;
    for (const msg of messages) {
      const key = this.messageKey(msg);
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(msg);
      changed = true;
    }
    this.trimSeen(seen);
    if (changed) {
      this.schedulePersistSyncState(accountId, seen);
    }
    return fresh;
  }

  private schedulePersistSyncState(accountId: string, seen: Set<string>) {
    const prev = this.persistTimers.get(accountId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.persistTimers.delete(accountId);
      void this.persistSyncState(accountId, seen, true);
    }, SEEN_PERSIST_DEBOUNCE_MS);
    this.persistTimers.set(accountId, timer);
  }

  private async persistSyncState(
    accountId: string,
    seen: Set<string>,
    bootstrapped: boolean,
  ) {
    try {
      await this.prisma.wechatAccount.update({
        where: { id: accountId },
        data: {
          syncBootstrapped: bootstrapped,
          syncSeenMsgIds: [...seen].slice(-SEEN_CAP),
        },
      });
    } catch (error) {
      this.logger.warn(
        `持久化入站位点失败 account=${accountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private messageKey(msg: ParsedPadMessage): string {
    if (msg.msgId) return msg.msgId;
    return `${msg.fromWxid}|${msg.msgType}|${msg.content.slice(0, 80)}`;
  }

  private trimSeen(seen: Set<string>) {
    if (seen.size <= SEEN_CAP) return;
    const overflow = seen.size - SEEN_CAP;
    let i = 0;
    for (const key of seen) {
      seen.delete(key);
      i += 1;
      if (i >= overflow) break;
    }
  }

  private sleep(ms: number, abortSignal: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (abortSignal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        abortSignal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

function parseSeenMsgIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}
