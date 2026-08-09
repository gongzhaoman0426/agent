import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { toolkitId } from '../toolkit/toolkit.decorator.js';
import {
  REQUEST_CONTEXT_KEYS,
  type SettingField,
  type ToolkitDefinition,
} from '../toolkit/toolkit.types.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatAdminOpsService } from './wechat-admin-ops.service.js';
import { WechatAdminService } from './wechat-admin.service.js';
import { WechatFriendRequestService } from './wechat-friend-request.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';
import { WechatTransferService } from './wechat-transfer.service.js';

const TOOLKIT_ID = 'wechat-toolkit';

const settingsFields: SettingField[] = [
  {
    key: 'adminSecret',
    label: '管理员密钥',
    description:
      '在微信私聊中发送与此完全相同的密钥即可提权；发朋友圈/好友/群等管理工具仅管理员可用',
    placeholder: '设置一个不易猜测的口令',
    required: true,
    secret: true,
  },
  {
    key: 'adminTtlHours',
    label: '管理员有效期（小时）',
    description:
      '提权后多久失效。填 0 或 permanent 表示永久（落库，直至撤销）；默认 24',
    placeholder: '24 或 0（永久）',
    required: false,
  },
];

function requireWechatChannelMeta(requestContext: RequestContext): {
  accountId: string;
  peerWxid: string;
  agentId: string;
} {
  const channel = requestContext.get(REQUEST_CONTEXT_KEYS.channel);
  if (channel !== 'wechat') {
    throw new Error('请在微信会话中使用微信工具');
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
  readonly name = '微信渠道';
  readonly description =
    '微信私聊渠道：发图/语音/收转账；管理员密钥提权后可用向指定好友发文本/语音/图片、发朋友圈、通过好友、备注、拉群、群公告、查通讯录等。可配合定时任务做主动触达运营。向文件传输助手发送「暂停」/「恢复」可开关整号自动回复（状态会持久化）。';
  readonly settingsFields = settingsFields;
  readonly tools: ToolsInput;

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly outbound: WechatOutboundService,
    private readonly transfers: WechatTransferService,
    private readonly admin: WechatAdminService,
    private readonly adminOps: WechatAdminOpsService,
    private readonly friendRequests: WechatFriendRequestService,
  ) {
    this.tools = {
      wechat_send_image: createTool({
        id: 'wechat-send-image',
        description:
          '向当前微信私聊对端发送图片（公网 URL）。成功后不要再输出文字回复。',
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
          '将文字合成为语音发送给当前私聊对端。成功后不要再输出文字回复。',
        inputSchema: z.object({
          text: z.string().min(1).max(300).describe('要朗读的文案'),
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

      wechat_collect_transfer: createTool({
        id: 'wechat-collect-transfer',
        description:
          '确认收取当前私聊会话中的待收款转账。无需传参；成功后可简短回复已收款。',
        inputSchema: z.object({}),
        execute: async (_input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.transfers.collectPending({
            accountId: ctx.accountId,
            peerWxid: ctx.peerWxid,
            agentId: ctx.agentId,
          });
        },
      }),

      wechat_admin_auth: createTool({
        id: 'wechat-admin-auth',
        description:
          '使用管理员密钥为当前微信会话提权。一般用户直接发送密钥即可自动提权；也可调用本工具并传入 secret。',
        inputSchema: z.object({
          secret: z.string().min(1).describe('管理员密钥'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.admin.elevateFromRequestContext({
            requestContext,
            accountId: ctx.accountId,
            peerWxid: ctx.peerWxid,
            secret: input.secret,
          });
        },
      }),

      wechat_send_to_user: createTool({
        id: 'wechat-send-to-user',
        description:
          '【管理员】向指定好友 wxid 主动发送文本、语音或图片（不是回当前会话）。' +
          '适合运营触达；配合定时任务时，到期指令应写清目标 wxid、类型与内容，并调用本工具。' +
          'type=text 需 text；type=voice 需 text（TTS 朗读，≤300字）；type=image 需 imageUrl（公网 URL）。' +
          '发给目标用户后，向管理员简短确认即可，勿把内部错误细节回传。',
        inputSchema: z.object({
          toWxid: z
            .string()
            .min(1)
            .describe('目标好友 wxid，如 wxid_xxx；可用 list/search 联系人获取'),
          type: z
            .enum(['text', 'voice', 'image'])
            .describe('消息类型：text=文字，voice=语音，image=图片'),
          text: z
            .string()
            .optional()
            .describe('文本内容，或语音要朗读的文案（voice 时必填）'),
          imageUrl: z
            .string()
            .optional()
            .describe('图片公网 URL（image 时必填）'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.sendToUser({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            toWxid: input.toWxid,
            type: input.type,
            text: input.text,
            imageUrl: input.imageUrl,
          });
        },
      }),

      wechat_post_moment: createTool({
        id: 'wechat-post-moment',
        description:
          '【管理员】发布朋友圈。可纯文字，或文字+图片公网 URL 列表（最多 9 张）。若协议返回 spamTips/发送失败会抛错，勿当成功。',
        inputSchema: z.object({
          content: z.string().describe('朋友圈文案，可为空字符串（仅图）'),
          imageUrls: z
            .array(z.string())
            .max(9)
            .optional()
            .describe('图片公网 URL 列表'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.postMoment({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            content: input.content,
            imageUrls: input.imageUrls,
          });
        },
      }),

      wechat_agree_friend: createTool({
        id: 'wechat-agree-friend',
        description:
          '【管理员】通过好友请求。若仅有一条待通过请求可省略 fromWxid；多条时需指定。',
        inputSchema: z.object({
          fromWxid: z
            .string()
            .optional()
            .describe('申请人 wxid；多条待通过时必填'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          await this.admin.requireAdmin(ctx.accountId, ctx.peerWxid);
          return this.friendRequests.agree({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            fromWxid: input.fromWxid,
          });
        },
      }),

      wechat_set_remark: createTool({
        id: 'wechat-set-remark',
        description: '【管理员】修改好友备注名。',
        inputSchema: z.object({
          userName: z.string().min(1).describe('好友 wxid'),
          remarkName: z.string().min(1).describe('备注名'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.setRemark({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            userName: input.userName,
            remarkName: input.remarkName,
          });
        },
      }),

      wechat_create_group: createTool({
        id: 'wechat-create-group',
        description:
          '【管理员】创建群聊。必须传至少 2 个好友的 wxid（不要昵称、不要自己的 wxid）；成功返回 chatRoomName。' +
          '若微信返回「创建群聊失败」，多为账号风控/重登限制，不是参数写错；可提示用户用手机手动建群验证。',
        inputSchema: z.object({
          topic: z.string().optional().describe('群名称/主题'),
          userList: z
            .array(z.string().min(1))
            .min(2)
            .describe('成员 wxid 列表，如 wxid_xxx'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.createGroup({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            topic: input.topic,
            userList: input.userList,
          });
        },
      }),

      wechat_invite_group_members: createTool({
        id: 'wechat-invite-group-members',
        description:
          '【管理员】邀请好友入群。默认 invite；群较小也可 mode=add 直接拉人。',
        inputSchema: z.object({
          chatRoomName: z.string().min(1).describe('群 ID，如 xxx@chatroom'),
          userList: z.array(z.string().min(1)).min(1).describe('好友 wxid 列表'),
          mode: z
            .enum(['invite', 'add'])
            .optional()
            .describe('invite=邀请链接，add=直接拉人'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.inviteToGroup({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            chatRoomName: input.chatRoomName,
            userList: input.userList,
            mode: input.mode,
          });
        },
      }),

      wechat_set_group_announcement: createTool({
        id: 'wechat-set-group-announcement',
        description: '【管理员】设置群公告。',
        inputSchema: z.object({
          chatRoomName: z.string().min(1).describe('群 ID，如 xxx@chatroom'),
          content: z.string().min(1).describe('公告内容'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.setGroupAnnouncement({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            chatRoomName: input.chatRoomName,
            content: input.content,
          });
        },
      }),

      wechat_list_contacts: createTool({
        id: 'wechat-list-contacts',
        description:
          '【管理员】获取通讯录：好友 wxid 列表 + 群 chatRooms（@chatroom），并附带前 20 个好友详情摘要。',
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe('最多返回多少个 wxid，默认 50'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.listContacts({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            limit: input.limit,
          });
        },
      }),

      wechat_search_contact: createTool({
        id: 'wechat-search-contact',
        description:
          '【管理员】搜索联系人。优先传微信号/手机号/QQ；若已是 wxid_… 或 xxx@chatroom 则查本地详情（SearchContact 不接受 wxid）。',
        inputSchema: z.object({
          keyword: z
            .string()
            .min(1)
            .describe('微信号/手机号/QQ；或已有好友的 wxid / 群 ID'),
        }),
        execute: async (input, { requestContext }) => {
          const ctx = requireWechatChannelMeta(requestContext);
          return this.adminOps.searchFriend({
            accountId: ctx.accountId,
            agentId: ctx.agentId,
            peerWxid: ctx.peerWxid,
            keyword: input.keyword,
          });
        },
      }),
    };
  }
}
