import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserPayload } from '../auth/auth.type';
import { FeishuMessageEvent, UpsertFeishuBotBindingDto } from './feishu.type';

type FeishuBotBindingRecord = {
  id: string;
  agentId: string;
  userId: string;
  appId: string;
  appSecret: string;
  enabled: boolean;
};

@Injectable()
export class FeishuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeishuService.name);
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private readonly processedMessages = new Map<string, number>();
  private readonly wsClients = new Map<string, { close: (params?: { force?: boolean }) => void }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async onModuleInit() {
    await this.startEnabledConnections();
  }

  onModuleDestroy() {
    for (const client of this.wsClients.values()) {
      client.close({ force: true });
    }
    this.wsClients.clear();
  }

  private async startEnabledConnections() {
    const bindings = await this.prisma.feishuBotBinding.findMany({
      where: { enabled: true },
    });

    for (const binding of bindings) {
      await this.startConnection(binding).catch((error) => {
        this.logger.error(`飞书长连接启动失败 (${binding.appId}): ${error.message}`, error.stack);
      });
    }
  }

  async getBinding(agentId: string, userId: string) {
    await this.agentService.findOne(agentId, userId);
    const binding = await this.prisma.feishuBotBinding.findFirst({
      where: { agentId, userId },
    });

    return binding ? this.toResponse(binding) : null;
  }

  async upsertBinding(agentId: string, userId: string, dto: UpsertFeishuBotBindingDto) {
    await this.agentService.findOne(agentId, userId);

    const appId = dto.appId.trim();
    const existingForAgent = await this.prisma.feishuBotBinding.findFirst({
      where: { agentId, userId },
    });

    const existingForApp = await this.prisma.feishuBotBinding.findUnique({
      where: { appId },
    });

    if (
      existingForApp &&
      (!existingForAgent || existingForApp.id !== existingForAgent.id)
    ) {
      throw new BadRequestException('该飞书 App ID 已绑定到其他智能体');
    }

    const appSecret = dto.appSecret?.trim();
    if (!existingForAgent && !appSecret) {
      throw new BadRequestException('首次绑定需要填写 App Secret');
    }

    const data = {
      appId,
      enabled: dto.enabled ?? true,
      ...(appSecret ? { appSecret } : {}),
    };

    const binding = existingForAgent
      ? await this.prisma.feishuBotBinding.update({
          where: { id: existingForAgent.id },
          data,
        })
      : await this.prisma.feishuBotBinding.create({
          data: {
            ...data,
            appSecret: appSecret!,
            agentId,
            userId,
          },
        });

    this.tokenCache.delete(binding.appId);
    await this.restartConnection(binding);
    return this.toResponse(binding);
  }

  async deleteBinding(agentId: string, userId: string) {
    await this.agentService.findOne(agentId, userId);
    const binding = await this.prisma.feishuBotBinding.findFirst({
      where: { agentId, userId },
    });
    if (!binding) return;

    await this.prisma.feishuBotBinding.delete({ where: { id: binding.id } });
    this.tokenCache.delete(binding.appId);
    this.closeConnection(binding.appId);
  }

  private async restartConnection(binding: FeishuBotBindingRecord) {
    this.closeConnection(binding.appId);
    if (binding.enabled) {
      await this.startConnection(binding);
    }
  }

  private closeConnection(appId: string) {
    const existing = this.wsClients.get(appId);
    if (!existing) return;

    existing.close({ force: true });
    this.wsClients.delete(appId);
  }

  private async startConnection(binding: FeishuBotBindingRecord) {
    this.closeConnection(binding.appId);

    const Lark = await import('@larksuiteoapi/node-sdk');
    const wsClient = new Lark.WSClient({
      appId: binding.appId,
      appSecret: binding.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
      onReady: () => this.logger.log(`飞书长连接已连接: ${binding.appId}`),
      onError: (error: Error) => {
        this.logger.error(`飞书长连接异常 (${binding.appId}): ${error.message}`, error.stack);
      },
      onReconnecting: () => this.logger.warn(`飞书长连接重连中: ${binding.appId}`),
      onReconnected: () => this.logger.log(`飞书长连接已重连: ${binding.appId}`),
    });

    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (event: FeishuMessageEvent) => {
        const latest = await this.prisma.feishuBotBinding.findUnique({
          where: { appId: binding.appId },
        });
        if (!latest || !latest.enabled) return;

        await this.processMessageEvent(latest, event).catch((error) => {
          this.logger.error(`处理飞书消息失败: ${error.message}`, error.stack);
        });
      },
    });

    await wsClient.start({ eventDispatcher });
    this.wsClients.set(binding.appId, wsClient);
  }

  private async processMessageEvent(
    binding: FeishuBotBindingRecord,
    event: FeishuMessageEvent,
  ) {
    const message = event.message;
    const sender = event.sender;
    if (!message?.message_id || !message.chat_id) return;
    if (sender?.sender_type && sender.sender_type !== 'user') return;
    if (this.hasProcessed(message.message_id)) return;

    const userText = this.extractTextMessage(message);
    if (!userText) return;

    const tenantKey =
      event.tenant_key ||
      sender?.tenant_key ||
      'unknown';
    const sessionId = [
      'feishu',
      binding.appId,
      tenantKey,
      message.chat_type || 'chat',
      message.chat_id,
    ].join(':');

    const result = await this.agentService.chatWithAgent(
      binding.agentId,
      {
        message: userText,
        sessionId,
        context: {
          channel: 'feishu',
          appId: binding.appId,
          tenantKey,
          chatId: message.chat_id,
          messageId: message.message_id,
          senderOpenId: sender?.sender_id?.open_id,
        },
      },
      {
        userId: binding.userId,
        username: 'feishu',
        source: 'api',
      } satisfies CurrentUserPayload,
    );

    await this.sendTextMessage(binding, message.chat_id, result.response);
  }

  private extractTextMessage(message: FeishuMessageEvent['message']) {
    if (!message?.content) return '';
    if (message.message_type !== 'text') {
      return `用户发送了一条 ${message.message_type || '非文本'} 消息，当前飞书接入仅支持文本消息。`;
    }

    try {
      const parsed = JSON.parse(message.content) as { text?: string };
      let text = parsed.text || '';
      for (const mention of message.mentions || []) {
        if (mention.key) {
          text = text.replaceAll(mention.key, '');
        }
      }
      return text.trim();
    } catch {
      return '';
    }
  }

  private hasProcessed(messageId: string) {
    const now = Date.now();
    for (const [id, expiresAt] of this.processedMessages) {
      if (expiresAt <= now) this.processedMessages.delete(id);
    }

    if (this.processedMessages.has(messageId)) return true;
    this.processedMessages.set(messageId, now + 10 * 60 * 1000);
    return false;
  }

  private async getTenantAccessToken(binding: FeishuBotBindingRecord) {
    const cached = this.tokenCache.get(binding.appId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          app_id: binding.appId,
          app_secret: binding.appSecret,
        }),
      },
    );
    const data = (await res.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`获取飞书 tenant_access_token 失败: ${data.msg}`);
    }

    this.tokenCache.set(binding.appId, {
      token: data.tenant_access_token,
      expiresAt: Date.now() + ((data.expire || 7200) - 300) * 1000,
    });
    return data.tenant_access_token;
  }

  private async sendTextMessage(
    binding: FeishuBotBindingRecord,
    chatId: string,
    text: string,
  ) {
    const token = await this.getTenantAccessToken(binding);
    const safeText = text.length > 140_000 ? `${text.slice(0, 140_000)}\n\n[内容过长，已截断]` : text;
    const res = await fetch(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: safeText }),
        }),
      },
    );
    const data = (await res.json()) as { code: number; msg: string };
    if (data.code !== 0) {
      throw new Error(`发送飞书消息失败: ${data.msg}`);
    }
  }

  private toResponse(binding: {
    id: string;
    agentId: string;
    appId: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: binding.id,
      agentId: binding.agentId,
      appId: binding.appId,
      enabled: binding.enabled,
      appSecretConfigured: true,
      createdAt: binding.createdAt,
      updatedAt: binding.updatedAt,
    };
  }
}
