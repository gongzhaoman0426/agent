import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { WechatAccount } from '@prisma/client';
import { AgentService } from '../agent/agent.service.js';
import { ChatService } from '../agent/chat.service.js';
import { getUpdates } from './ilink/api.js';
import { MessageType } from './ilink/types.js';
import { extractTextFromMessage } from './ilink/send-text.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { buildWechatSessionId } from './wechat.paths.js';
import {
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
} from './wechat-sync-buf.js';

const DEFAULT_LONG_POLL_MS = 35_000;
const RETRY_DELAY_MS = 2_000;
const BACKOFF_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 为每个已启用微信账号跑 getUpdates 长轮询，
 * 文本消息 → ChatService(channel=wechat) → sendMessage 回微信。
 */
@Injectable()
export class WechatMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechatMonitorService.name);
  private readonly abortByAccount = new Map<string, AbortController>();
  private running = false;

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly agentService: AgentService,
    private readonly chatService: ChatService,
    private readonly outbound: WechatOutboundService,
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
  }

  async reload() {
    const enabled = await this.accounts.findEnabled();
    const enabledIds = new Set(enabled.map((row) => row.id));

    for (const [id, controller] of this.abortByAccount) {
      if (!enabledIds.has(id)) {
        controller.abort();
        this.abortByAccount.delete(id);
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
    let nextTimeoutMs = DEFAULT_LONG_POLL_MS;
    let getUpdatesBuf = loadGetUpdatesBuf(seed.accountId);

    this.logger.log(
      `微信监控启动 account=${seed.accountId} user=${seed.userId}`,
    );

    while (this.running && !abortSignal.aborted) {
      const row = await this.accounts.findById(seed.id);
      if (!row || !row.enabled) break;

      try {
        const resp = await getUpdates({
          baseUrl: row.baseUrl,
          token: row.token,
          get_updates_buf: getUpdatesBuf,
          timeoutMs: nextTimeoutMs,
          abortSignal,
        });

        if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms > 0) {
          nextTimeoutMs = resp.longpolling_timeout_ms;
        }

        const isApiError =
          (resp.ret !== undefined && resp.ret !== 0) ||
          (resp.errcode !== undefined && resp.errcode !== 0);

        if (isApiError) {
          consecutiveFailures += 1;
          this.logger.warn(
            `getUpdates 失败 account=${row.accountId} ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg}`,
          );
          await this.sleep(
            consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
              ? BACKOFF_DELAY_MS
              : RETRY_DELAY_MS,
            abortSignal,
          );
          continue;
        }

        consecutiveFailures = 0;
        if (resp.get_updates_buf != null) {
          getUpdatesBuf = resp.get_updates_buf;
          saveGetUpdatesBuf(row.accountId, getUpdatesBuf);
        }

        for (const msg of resp.msgs ?? []) {
          await this.handleMessage(row, msg);
        }
      } catch (error) {
        if (abortSignal.aborted) break;
        consecutiveFailures += 1;
        this.logger.error(
          `微信轮询异常 account=${seed.accountId}: ${
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

    this.logger.log(`微信监控停止 account=${seed.accountId}`);
  }

  private async handleMessage(
    row: WechatAccount,
    msg: {
      from_user_id?: string;
      message_type?: number;
      item_list?: Array<{ type?: number; text_item?: { text?: string } }>;
      context_token?: string;
    },
  ) {
    // 只处理用户消息
    if (msg.message_type != null && msg.message_type !== MessageType.USER) {
      return;
    }

    const peerUserId = msg.from_user_id?.trim();
    if (!peerUserId) return;

    const text = extractTextFromMessage(msg.item_list).trim();
    if (!text) {
      // 首期仅文本
      return;
    }

    if (msg.context_token) {
      await this.accounts.setPeerContextToken(
        row.id,
        peerUserId,
        msg.context_token,
      );
    }

    const sessionId = buildWechatSessionId(row.userId, peerUserId);

    try {
      const agent = await this.agentService.findOwned(
        row.defaultAgentId,
        row.userId,
      );

      const result = await this.chatService.chat(
        agent,
        {
          message: text,
          sessionId,
          channel: 'wechat',
        },
        row.userId,
        {
          channelMeta: {
            accountId: row.accountId,
            accountDbId: row.id,
            peerUserId,
            contextToken: msg.context_token,
          },
        },
      );

      if (result.response?.trim()) {
        await this.outbound.sendByDbId({
          accountDbId: row.id,
          peerUserId,
          text: result.response,
          contextToken: msg.context_token,
        });
      }
    } catch (error) {
      this.logger.error(
        `处理微信消息失败 peer=${peerUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.outbound.sendByDbId({
        accountDbId: row.id,
        peerUserId,
        text: `处理失败：${error instanceof Error ? error.message : String(error)}`,
        contextToken: msg.context_token,
      });
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
