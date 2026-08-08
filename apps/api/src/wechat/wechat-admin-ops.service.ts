import { Injectable, Logger } from '@nestjs/common';
import {
  getContactDetails,
  getContactList,
  modifyRemark,
  searchContact,
} from './pad/friend.js';
import {
  addChatRoomMembers,
  createChatRoom,
  inviteChatroomMembers,
  setChatroomAnnouncement,
} from './pad/group.js';
import { fetchAsBase64 } from './pad/message.js';
import {
  MEDIA_TYPE_IMAGE,
  sendFriendCircle,
  type SnsMediaItem,
  uploadFriendCircleImages,
} from './pad/sns.js';
import { WechatAccountService } from './wechat-account.service.js';
import { WechatAdminService } from './wechat-admin.service.js';
import { WechatOutboundService } from './wechat-outbound.service.js';

@Injectable()
export class WechatAdminOpsService {
  private readonly logger = new Logger(WechatAdminOpsService.name);

  constructor(
    private readonly accounts: WechatAccountService,
    private readonly admin: WechatAdminService,
    private readonly outbound: WechatOutboundService,
  ) {}

  private async requireOwnedAccount(accountId: string, agentId: string) {
    const row = await this.accounts.findById(accountId);
    if (!row || row.agentId !== agentId) {
      throw new Error('当前会话绑定的微信号无效');
    }
    return row;
  }

  /**
   * 管理员主动触达：向指定 wxid 发送文本 / 语音 / 图片。
   * 可与定时任务配合：到期指令里调用本能力给目标用户发运营消息。
   */
  async sendToUser(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    toWxid: string;
    type: 'text' | 'voice' | 'image';
    text?: string;
    imageUrl?: string;
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    await this.requireOwnedAccount(input.accountId, input.agentId);

    const toWxid = input.toWxid.trim();
    if (!toWxid) throw new Error('目标 wxid 不能为空');
    if (toWxid === 'newsapp' || toWxid.startsWith('gh_')) {
      throw new Error('不能向系统号/公众号发送');
    }

    if (input.type === 'text') {
      const text = input.text?.trim() || '';
      if (!text) throw new Error('发送文本时 text 不能为空');
      const ok = await this.outbound.sendByDbId({
        accountDbId: input.accountId,
        peerWxid: toWxid,
        text,
      });
      if (!ok) throw new Error('发送文本失败');
      this.logger.log(
        `管理员触达文本 account=${input.accountId} to=${toWxid} len=${text.length}`,
      );
      return { success: true as const, type: 'text' as const, to: toWxid };
    }

    if (input.type === 'voice') {
      const text = input.text?.trim() || '';
      if (!text) throw new Error('发送语音时 text（朗读文案）不能为空');
      if (text.length > 300) throw new Error('语音文案最多 300 字');
      const ok = await this.outbound.sendVoiceTextByDbId({
        accountDbId: input.accountId,
        peerWxid: toWxid,
        text,
      });
      if (!ok) throw new Error('发送语音失败');
      this.logger.log(
        `管理员触达语音 account=${input.accountId} to=${toWxid}`,
      );
      return { success: true as const, type: 'voice' as const, to: toWxid };
    }

    const imageUrl = input.imageUrl?.trim() || '';
    if (!imageUrl) throw new Error('发送图片时 imageUrl 不能为空');
    const ok = await this.outbound.sendImageByDbId({
      accountDbId: input.accountId,
      peerWxid: toWxid,
      imageUrl,
    });
    if (!ok) throw new Error('发送图片失败');
    this.logger.log(
      `管理员触达图片 account=${input.accountId} to=${toWxid}`,
    );
    return { success: true as const, type: 'image' as const, to: toWxid };
  }

  async postMoment(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    content: string;
    imageUrls?: string[];
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    const content = input.content.trim();
    if (!content && !(input.imageUrls?.length)) {
      throw new Error('朋友圈文案与图片不能都为空');
    }

    let mediaList: SnsMediaItem[] | undefined;
    const urls = (input.imageUrls ?? []).map((u) => u.trim()).filter(Boolean);
    if (urls.length > 0) {
      if (urls.length > 9) {
        throw new Error('朋友圈图片最多 9 张');
      }
      const base64List: string[] = [];
      for (const url of urls) {
        const { base64 } = await fetchAsBase64(url);
        base64List.push(base64);
      }
      const uploaded = await uploadFriendCircleImages({
        authKey: row.authKey,
        imageBase64List: base64List,
      });
      mediaList = mapUploadToMediaList(uploaded);
      if (!mediaList.length) {
        throw new Error('朋友圈图片上传失败，未拿到可用 CDN 地址');
      }
    }

    const data = await sendFriendCircle({
      authKey: row.authKey,
      content: content || ' ',
      mediaList,
    });
    return { success: true as const, data, imageCount: mediaList?.length ?? 0 };
  }

  async setRemark(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    userName: string;
    remarkName: string;
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    await modifyRemark({
      authKey: row.authKey,
      userName: input.userName.trim(),
      remarkName: input.remarkName.trim(),
    });
    return { success: true as const };
  }

  async createGroup(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    topic?: string;
    userList: string[];
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    const userList = input.userList.map((u) => u.trim()).filter(Boolean);
    if (userList.length < 2) {
      throw new Error('创建群至少需要 2 个好友 wxid');
    }
    const data = await createChatRoom({
      authKey: row.authKey,
      topic: input.topic,
      userList,
    });
    const chatRoomName = extractChatRoomName(data);
    return {
      success: true as const,
      chatRoomName: chatRoomName || undefined,
      data,
    };
  }

  async inviteToGroup(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    chatRoomName: string;
    userList: string[];
    mode?: 'invite' | 'add';
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    const userList = input.userList.map((u) => u.trim()).filter(Boolean);
    if (!input.chatRoomName.trim() || userList.length === 0) {
      throw new Error('需要 chatRoomName 与 userList');
    }
    const payload = {
      authKey: row.authKey,
      chatRoomName: input.chatRoomName.trim(),
      userList,
    };
    const data =
      input.mode === 'add'
        ? await addChatRoomMembers(payload)
        : await inviteChatroomMembers(payload);
    return { success: true as const, data };
  }

  async setGroupAnnouncement(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    chatRoomName: string;
    content: string;
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    await setChatroomAnnouncement({
      authKey: row.authKey,
      chatRoomName: input.chatRoomName.trim(),
      content: input.content,
    });
    return { success: true as const };
  }

  async listContacts(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    limit?: number;
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);

    // v875: Data.ContactList.contactUsernameList + continueFlag 分页
    const names: string[] = [];
    let wxSeq = 0;
    let roomSeq = 0;
    for (let page = 0; page < 30; page += 1) {
      const data = await getContactList({
        authKey: row.authKey,
        currentWxcontactSeq: wxSeq,
        currentChatRoomContactSeq: roomSeq,
      });
      const pageInfo = extractContactPage(data);
      names.push(...pageInfo.userNames);
      wxSeq = pageInfo.wxSeq;
      roomSeq = pageInfo.roomSeq;
      if (!pageInfo.continueFlag) break;
    }

    const friends = names.filter(isLikelyFriendUsername);
    const rooms = names.filter((n) => n.includes('@chatroom'));
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const slice = friends.slice(0, limit);
    const roomSlice = rooms.slice(0, Math.min(limit, 50));

    let details: unknown = null;
    if (slice.length > 0) {
      try {
        details = await getContactDetails({
          authKey: row.authKey,
          userNames: slice.slice(0, 20),
        });
      } catch (error) {
        this.logger.warn(
          `拉取联系人详情失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      success: true as const,
      totalReturned: slice.length,
      totalFriends: friends.length,
      totalRooms: rooms.length,
      totalRaw: names.length,
      userNames: slice,
      chatRooms: roomSlice,
      detailsPreview: summarizeContactDetails(details),
    };
  }

  async searchFriend(input: {
    accountId: string;
    agentId: string;
    peerWxid: string;
    keyword: string;
  }) {
    await this.admin.requireAdmin(input.accountId, input.peerWxid);
    const row = await this.requireOwnedAccount(input.accountId, input.agentId);
    const keyword = input.keyword.trim();
    if (!keyword) throw new Error('搜索关键字不能为空');

    // SearchContact 不接受 wxid_…；已有好友用 GetContactDetails
    if (looksLikeWxidOrRoom(keyword)) {
      const data = await getContactDetails({
        authKey: row.authKey,
        userNames: [keyword],
      });
      const preview = summarizeContactDetails(data);
      if (!preview.length) {
        throw new Error(`未找到联系人：${keyword}`);
      }
      return {
        success: true as const,
        mode: 'details' as const,
        contact: preview[0],
        detailsPreview: preview,
      };
    }

    const data = await searchContact({
      authKey: row.authKey,
      userName: keyword,
    });
    return {
      success: true as const,
      mode: 'search' as const,
      contact: summarizeSearchContact(data),
      data,
    };
  }
}

function mapUploadToMediaList(uploaded: unknown): SnsMediaItem[] {
  const rows = Array.isArray(uploaded) ? uploaded : [];
  const out: SnsMediaItem[] = [];
  let id = 1;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const resp = (row as { resp?: Record<string, unknown> }).resp;
    if (!resp) continue;
    const url = String(resp.FileURL ?? resp.fileURL ?? '').trim();
    if (!url) continue;
    out.push({
      ID: id++,
      Type: MEDIA_TYPE_IMAGE,
      URL: url,
      URLType: '1',
      Thumb: String(resp.ThumbURL ?? resp.thumbURL ?? url),
      ThumType: '1',
      MD5: String(resp.ImageMD5 ?? resp.imageMD5 ?? ''),
      SizeWidth: String(resp.ImageWidth ?? resp.imageWidth ?? ''),
      SizeHeight: String(resp.ImageHeight ?? resp.imageHeight ?? ''),
      Private: 0,
    });
  }
  return out;
}

type ContactPage = {
  userNames: string[];
  wxSeq: number;
  roomSeq: number;
  continueFlag: boolean;
};

/**
 * v875 GetContactList Data 形态：
 * { ContactList: { contactUsernameList, currentWxcontactSeq, continueFlag, ... }, retCode }
 */
function extractContactPage(data: unknown): ContactPage {
  const empty: ContactPage = {
    userNames: [],
    wxSeq: 0,
    roomSeq: 0,
    continueFlag: false,
  };
  if (!data || typeof data !== 'object') return empty;

  const root = data as Record<string, unknown>;
  const nested =
    (root.ContactList as Record<string, unknown> | undefined) ||
    (root.contactList as Record<string, unknown> | undefined) ||
    root;

  const list =
    nested.contactUsernameList ??
    nested.ContactUsernameList ??
    nested.userNameList ??
    nested.UserNameList;

  const userNames = Array.isArray(list)
    ? list
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>;
            return String(
              rec.UserName ?? rec.userName ?? rec.username ?? '',
            ).trim();
          }
          return '';
        })
        .filter(Boolean)
    : [];

  return {
    userNames,
    wxSeq: Number(
      nested.currentWxcontactSeq ?? nested.CurrentWxcontactSeq ?? 0,
    ),
    roomSeq: Number(
      nested.currentChatRoomContactSeq ??
        nested.CurrentChatRoomContactSeq ??
        0,
    ),
    continueFlag: Boolean(
      Number(nested.continueFlag ?? nested.ContinueFlag ?? 0),
    ),
  };
}

const SYSTEM_CONTACT_BLOCKLIST = new Set([
  'weixin',
  'fmessage',
  'medianote',
  'floatbottle',
  'qmessage',
  'tmessage',
  'qqmail',
  'filehelper',
  'newsapp',
]);

function isLikelyFriendUsername(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (SYSTEM_CONTACT_BLOCKLIST.has(n)) return false;
  if (n.startsWith('gh_')) return false; // 公众号
  if (n.includes('@chatroom')) return false;
  if (n.includes('@openim')) return false;
  return true;
}

function summarizeContactDetails(details: unknown): Array<{
  userName: string;
  nickName: string;
  remark: string;
  alias: string;
}> {
  if (!details || typeof details !== 'object') return [];
  const root = details as Record<string, unknown>;
  const list = root.ContactList ?? root.contactList;
  const arr = Array.isArray(list) ? list : [];

  const out: Array<{
    userName: string;
    nickName: string;
    remark: string;
    alias: string;
  }> = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const userName = pickNestedStr(rec.userName ?? rec.UserName);
    if (!userName) continue;
    out.push({
      userName,
      nickName: pickNestedStr(rec.nickName ?? rec.NickName),
      remark: pickNestedStr(rec.remark ?? rec.Remark),
      alias: pickNestedStr(
        rec.aliasName ?? rec.AliasName ?? rec.alias ?? rec.Alias,
      ),
    });
  }
  return out;
}

function summarizeSearchContact(data: unknown): {
  userName: string;
  nickName: string;
  alias: string;
  v3: string;
} {
  if (!data || typeof data !== 'object') {
    return { userName: '', nickName: '', alias: '', v3: '' };
  }
  const root = data as Record<string, unknown>;
  // SearchContact 多为 snake_case：user_name / nick_name / alias
  return {
    userName: pickNestedStr(
      root.userName ?? root.UserName ?? root.user_name,
    ),
    nickName: pickNestedStr(
      root.nickName ?? root.NickName ?? root.nick_name,
    ),
    alias: pickNestedStr(
      root.aliasName ??
        root.AliasName ??
        root.alias_name ??
        root.alias ??
        root.Alias,
    ),
    v3: pickNestedStr(
      root.v3 ??
        root.V3 ??
        root.encryptUserName ??
        root.EncryptUserName ??
        root.encrypt_user_name,
    ),
  };
}

function extractChatRoomName(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const root = data as Record<string, unknown>;
  const direct = pickNestedStr(
    root.chatRoomName ?? root.ChatRoomName ?? root.chatroomName,
  );
  if (direct) return direct;

  for (const key of Object.keys(root)) {
    const val = root[key];
    if (typeof val === 'string' && val.includes('@chatroom')) return val.trim();
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = pickNestedStr(
        (val as Record<string, unknown>).str ??
          (val as Record<string, unknown>).Str,
      );
      if (nested.includes('@chatroom')) return nested;
    }
  }
  return '';
}

function looksLikeWxidOrRoom(keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  if (k.includes('@chatroom')) return true;
  if (k.startsWith('wxid_')) return true;
  // 部分老号无 wxid_ 前缀，但仍是内部 id；含空格/中文则更像搜索词
  if (/^[\w.-]{6,}$/.test(k) && !k.includes('@') && k === k.toLowerCase()) {
    // 微信号也可能是小写字母数字；不强制当 wxid，交给 SearchContact
  }
  return false;
}

function pickNestedStr(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.str === 'string') return obj.str.trim();
    if (typeof obj.Str === 'string') return obj.Str.trim();
  }
  return '';
}
