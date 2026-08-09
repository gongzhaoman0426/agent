import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { WechatAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { getPadOnlineStatus } from './pad/status.js';
import type { ParsedPadMessage } from './pad/types.js';
import { connectPadSyncWs } from './pad/ws-sync.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatInboundService } from './wechat-inbound.service.js';
import { WechatReplyGateService } from './wechat-reply-gate.service.js';

const RECONNECT_DELAY_MS = 2_000;
const RECONNECT_BACKOFF_MS = 15_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const ONLINE_CHECK_EVERY_CONNECT = 5;
const SEEN_CAP = 3_000;
const SEEN_PERSIST_DEBOUNCE_MS = 2_000;
/** 建连后若持续有历史推送，空闲这么久才结束追赶 */
const CATCHUP_IDLE_MS = 1_500;
/** 单次建连最长追赶时间，防止一直不进直播 */
const CATCHUP_MAX_MS = 8_000;

/**
 * v875 入站：只用 WebSocket `/ws/GetSyncMsg`。
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

    this.logger.log(`微信监控已同步，活跃账号 ${enabled.length} 个（仅 WS）`);
  }

  private async loopAccount(seed: WechatAccount, abortSignal: AbortSignal) {
    let consecutiveFailures = 0;
    let connectCount = 0;

    this.logger.log(
      `微信监控启动 wxid=${seed.wxid} agent=${seed.agentId}（仅 WebSocket）`,
    );

    while (this.running && !abortSignal.aborted) {
      const row = await this.accounts.findById(seed.id);
      if (!row || !row.enabled) break;

      this.replyGate.hydrateFromRow(row.id, row.autoReplyPaused);
      await this.ensureHydrated(row.id);

      if (connectCount % ONLINE_CHECK_EVERY_CONNECT === 0) {
        try {
          const status = await getPadOnlineStatus(row.authKey);
          if (!status.online) {
            this.logger.warn(
              `wxid=${row.wxid} ${status.message}；将继续尝试 WS 同步`,
            );
          } else if (connectCount === 0) {
            this.logger.log(`wxid=${row.wxid} 在线检测通过`);
          }
        } catch {
          // ignore
        }
      }
      connectCount += 1;

      let catchingUp = true;
      let catchupTimer: NodeJS.Timeout | undefined;
      let maxCatchupTimer: NodeJS.Timeout | undefined;
      let handleChain: Promise<void> = Promise.resolve();

      const endCatchup = () => {
        if (!catchingUp) return;
        catchingUp = false;
        if (catchupTimer) clearTimeout(catchupTimer);
        if (maxCatchupTimer) clearTimeout(maxCatchupTimer);
        if (!this.bootstrapped.has(row.id)) {
          this.bootstrapped.add(row.id);
          void this.persistSyncState(row.id, true);
          this.logger.log(
            `入站位点已建立 account=${row.id} seen=${
              this.seenByAccount.get(row.id)?.size ?? 0
            }（WS，历史不回放）`,
          );
        } else {
          this.logger.log(`WS 历史追赶结束，开始处理新消息 wxid=${row.wxid}`);
        }
      };

      const bumpCatchupIdle = () => {
        if (!catchingUp) return;
        if (catchupTimer) clearTimeout(catchupTimer);
        catchupTimer = setTimeout(endCatchup, CATCHUP_IDLE_MS);
      };

      const closed = await new Promise<'ok' | 'error'>((resolve) => {
        let settled = false;
        const finish = (result: 'ok' | 'error') => {
          if (settled) return;
          settled = true;
          if (catchupTimer) clearTimeout(catchupTimer);
          if (maxCatchupTimer) clearTimeout(maxCatchupTimer);
          resolve(result);
        };

        connectPadSyncWs(
          row.authKey,
          {
            onOpen: () => {
              consecutiveFailures = 0;
              this.logger.log(`微信 WS 已连接 wxid=${row.wxid}`);
              bumpCatchupIdle();
              maxCatchupTimer = setTimeout(endCatchup, CATCHUP_MAX_MS);
            },
            onMessage: (msg) => {
              if (abortSignal.aborted) return;

              const isNew = this.rememberMessage(row.id, msg);
              if (!isNew) return;

              if (catchingUp) {
                bumpCatchupIdle();
                return;
              }

              // 串行处理，避免同一 peer 并发打模型
              handleChain = handleChain.then(async () => {
                if (abortSignal.aborted) return;
                const latest = await this.accounts.findById(seed.id);
                if (!latest || !latest.enabled) return;
                this.replyGate.hydrateFromRow(
                  latest.id,
                  latest.autoReplyPaused,
                );
                await this.inbound.handleParsed(latest, msg);
              });
            },
            onError: (error) => {
              this.logger.warn(
                `微信 WS 错误 wxid=${row.wxid}: ${error.message}`,
              );
            },
            onClose: (code, reason) => {
              this.logger.warn(
                `微信 WS 断开 wxid=${row.wxid} code=${code} ${reason}`,
              );
              finish('ok');
            },
          },
          abortSignal,
        );

        abortSignal.addEventListener('abort', () => finish('ok'), {
          once: true,
        });
      });

      await handleChain.catch(() => undefined);

      if (abortSignal.aborted || !this.running) break;

      if (closed === 'error') {
        consecutiveFailures += 1;
      }

      const delay =
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
          ? RECONNECT_BACKOFF_MS
          : RECONNECT_DELAY_MS;
      await this.sleep(delay, abortSignal);
    }

    this.logger.log(`微信监控停止 wxid=${seed.wxid}`);
  }

  /** @returns 是否首次见到该消息 */
  private rememberMessage(accountId: string, msg: ParsedPadMessage): boolean {
    let seen = this.seenByAccount.get(accountId);
    if (!seen) {
      seen = new Set<string>();
      this.seenByAccount.set(accountId, seen);
    }
    const key = this.messageKey(msg);
    if (seen.has(key)) return false;
    seen.add(key);
    this.trimSeen(seen);
    this.schedulePersistSyncState(accountId, seen);
    return true;
  }

  private async ensureHydrated(accountId: string) {
    if (this.hydrated.has(accountId)) return;

    const row = await this.prisma.wechatAccount.findUnique({
      where: { id: accountId },
      select: { syncBootstrapped: true, syncSeenMsgIds: true },
    });

    const seen = new Set<string>();
    for (const id of parseSeenMsgIds(row?.syncSeenMsgIds)) seen.add(id);
    this.seenByAccount.set(accountId, seen);

    if (row?.syncBootstrapped) {
      this.bootstrapped.add(accountId);
      this.logger.log(
        `入站位点已从数据库恢复 account=${accountId} seen=${seen.size}`,
      );
    }

    this.hydrated.add(accountId);
  }

  private schedulePersistSyncState(accountId: string, seen: Set<string>) {
    const prev = this.persistTimers.get(accountId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.persistTimers.delete(accountId);
      void this.persistSyncState(
        accountId,
        this.bootstrapped.has(accountId),
        seen,
      );
    }, SEEN_PERSIST_DEBOUNCE_MS);
    this.persistTimers.set(accountId, timer);
  }

  private async persistSyncState(
    accountId: string,
    bootstrapped: boolean,
    seen = this.seenByAccount.get(accountId),
  ) {
    if (!seen) return;
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
