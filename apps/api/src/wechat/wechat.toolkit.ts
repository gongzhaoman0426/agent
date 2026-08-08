import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { toolkitId } from '../toolkit/toolkit.decorator.js';
import {
  REQUEST_CONTEXT_KEYS,
  type ToolkitDefinition,
} from '../toolkit/toolkit.types.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';

const TOOLKIT_ID = 'wechat-toolkit';

function requireWechatChannelMeta(requestContext: RequestContext): {
  accountId: string;
  peerWxid: string;
  agentId: string;
} {
  const channel = requestContext.get(REQUEST_CONTEXT_KEYS.channel);
  if (channel !== 'wechat') {
    throw new Error('请在微信会话中使用微信媒体工具');
  }

  const agentId = requestContext.get(REQUEST_CONTEXT_KEYS.agentId);
  if (typeof agentId !== 'string' || !agentId) {
    throw new Error('缺少 Agent 上下文');
  }

  const meta = requestContext.get(REQUEST_CONTEXT_KEYS.channelMeta) as
    | Record<string, unknown>
    | undefined;
  const accountId = String(meta?.accountId ?? meta?.accountDbId ?? '');
  const peerWxid = String(meta?.peerWxid ?? meta?.peerUserId ?? '');
  if (!accountId || !peerWxid) {
    throw new Error('缺少微信会话上下文（accountId / peerWxid）');
  }

  return { accountId, peerWxid, agentId };
}

@toolkitId(TOOLKIT_ID)
export class WechatToolkit implements ToolkitDefinition {
  readonly name = '微信媒体';
  readonly description =
    '仅在微信私聊会话中使用：向当前对话对端发送图片，或把文字合成语音后发送。出发微信号与接收方由当前会话自动确定。';
  readonly tools: ToolsInput;

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly outbound: WechatOutboundService,
  ) {
    this.tools = {
      wechat_send_image: createTool({
        id: 'wechat-send-image',
        description:
          '在当前微信私聊中向对端发送一张图片。仅微信会话可用；参数为图片公网 URL。成功后不要再输出任何文字回复。',
        inputSchema: z.object({
          imageUrl: z.string().min(1).describe('图片公网 URL'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          const row = await this.accounts.findById(ctx.accountId);
          if (!row || row.agentId !== ctx.agentId) {
            throw new Error('当前会话绑定的微信号无效');
          }
          const ok = await this.outbound.sendImageByDbId({
            accountDbId: ctx.accountId,
            peerWxid: ctx.peerWxid,
            imageUrl: input.imageUrl,
          });
          if (!ok) throw new Error('发送图片失败');
          requestContext.set(REQUEST_CONTEXT_KEYS.wechatMediaDelivered, true);
          return { success: true, to: ctx.peerWxid, skipTextReply: true };
        },
      }),

      wechat_send_voice: createTool({
        id: 'wechat-send-voice',
        description:
          '在当前微信私聊中，将文字合成为语音后发送给对端。仅微信会话可用；传入要朗读的文本即可。成功后不要再输出任何文字回复（内容已通过语音送达）。',
        inputSchema: z.object({
          text: z
            .string()
            .min(1)
            .max(300)
            .describe('要合成并发送的语音文案（建议简短，最多约 300 字）'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          const row = await this.accounts.findById(ctx.accountId);
          if (!row || row.agentId !== ctx.agentId) {
            throw new Error('当前会话绑定的微信号无效');
          }
          const ok = await this.outbound.sendVoiceTextByDbId({
            accountDbId: ctx.accountId,
            peerWxid: ctx.peerWxid,
            text: input.text,
          });
          if (!ok) throw new Error('发送语音失败');
          requestContext.set(REQUEST_CONTEXT_KEYS.wechatMediaDelivered, true);
          return { success: true, to: ctx.peerWxid, skipTextReply: true };
        },
      }),
    };
  }
}
