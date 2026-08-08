import { Injectable, Logger } from '@nestjs/common';
import { collectMoney } from './pad/pay.js';
import { WechatAccountService } from './wechat-account.service.js';

export type PendingTransfer = {
  accountId: string;
  peerWxid: string;
  transferId: string;
  transactionId: string;
  invalidTime: string;
  toUserName: string;
  feeDesc: string;
  memo: string;
  createdAt: number;
};

const APPMSG_TRANSFER = 2000;
/** 待收款通知；其它 subtype（已收/退回等）忽略 */
const PAY_SUBTYPE_RECEIVE = 1;

@Injectable()
export class WechatTransferService {
  private readonly logger = new Logger(WechatTransferService.name);
  /** key = `${accountId}:${peerWxid}` → 该会话最近一笔待收款 */
  private readonly pending = new Map<string, PendingTransfer>();

  constructor(private readonly accounts: WechatAccountService) {}

  /**
   * 从 appmsg XML 解析转账；成功则写入待收款缓存并返回摘要文案（供喂给 Agent）。
   */
  rememberFromAppMsg(input: {
    accountId: string;
    accountWxid: string;
    peerWxid: string;
    content: string;
  }): { prompt: string; pending: PendingTransfer } | null {
    const parsed = parseTransferAppMsg(input.content);
    if (!parsed) return null;

    const toUserName =
      parsed.receiverUsername?.trim() || input.accountWxid.trim();
    if (!toUserName) return null;

    const pending: PendingTransfer = {
      accountId: input.accountId,
      peerWxid: input.peerWxid,
      transferId: parsed.transferId,
      transactionId: parsed.transactionId,
      invalidTime: parsed.invalidTime,
      toUserName,
      feeDesc: parsed.feeDesc,
      memo: parsed.memo,
      createdAt: Date.now(),
    };
    this.pending.set(this.key(input.accountId, input.peerWxid), pending);
    this.logger.log(
      `待收款已缓存 account=${input.accountId} peer=${input.peerWxid} fee=${pending.feeDesc}`,
    );

    const memoPart = pending.memo ? `，备注：${pending.memo}` : '';
    return {
      pending,
      prompt:
        `[微信转账] 对方发来一笔转账${pending.feeDesc ? `（${pending.feeDesc}）` : ''}${memoPart}。` +
        `若确认收款，请调用工具 wechat_collect_transfer；若暂不收可不调用。`,
    };
  }

  getPending(accountId: string, peerWxid: string): PendingTransfer | undefined {
    return this.pending.get(this.key(accountId, peerWxid));
  }

  async collectPending(input: {
    accountId: string;
    peerWxid: string;
    agentId: string;
  }): Promise<{
    success: true;
    feeDesc: string;
    transferId: string;
  }> {
    const row = await this.accounts.findById(input.accountId);
    if (!row || row.agentId !== input.agentId) {
      throw new Error('当前会话绑定的微信号无效');
    }

    const pending = this.getPending(input.accountId, input.peerWxid);
    if (!pending) {
      throw new Error(
        '当前会话没有待确认的转账（请等对方发来转账后再收款）',
      );
    }

    await collectMoney({
      authKey: row.authKey,
      invalidTime: pending.invalidTime,
      transferId: pending.transferId,
      transactionId: pending.transactionId,
      toUserName: pending.toUserName || row.wxid,
    });

    this.pending.delete(this.key(input.accountId, input.peerWxid));
    return {
      success: true,
      feeDesc: pending.feeDesc,
      transferId: pending.transferId,
    };
  }

  private key(accountId: string, peerWxid: string) {
    return `${accountId}:${peerWxid}`;
  }
}

type ParsedTransferXml = {
  transferId: string;
  transactionId: string;
  invalidTime: string;
  receiverUsername: string;
  feeDesc: string;
  memo: string;
};

/** 解析微信转账 appmsg（type=2000） */
export function parseTransferAppMsg(content: string): ParsedTransferXml | null {
  const xml = content?.trim();
  if (!xml || !xml.includes('<appmsg') || !xml.includes('wcpayinfo')) {
    return null;
  }

  const type = Number(pickXmlTag(xml, 'type') || 0);
  if (type !== APPMSG_TRANSFER) return null;

  const payBlock = extractInner(xml, 'wcpayinfo');
  if (!payBlock) return null;

  const paySubtype = Number(pickXmlTag(payBlock, 'paysubtype') || 0);
  if (paySubtype && paySubtype !== PAY_SUBTYPE_RECEIVE) {
    return null;
  }

  const transferId = pickXmlTag(payBlock, 'transferid');
  // 微信 XML 字段拼写为 transcationid
  const transactionId =
    pickXmlTag(payBlock, 'transcationid') ||
    pickXmlTag(payBlock, 'transactionid');
  const invalidTime = pickXmlTag(payBlock, 'invalidtime');
  if (!transferId || !transactionId || !invalidTime) return null;

  return {
    transferId,
    transactionId,
    invalidTime,
    receiverUsername: pickXmlTag(payBlock, 'receiver_username'),
    feeDesc: pickXmlTag(payBlock, 'feedesc') || pickXmlTag(xml, 'des'),
    memo: pickXmlTag(payBlock, 'pay_memo'),
  };
}

function extractInner(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  return match?.[1]?.trim() || '';
}

function pickXmlTag(xml: string, tag: string): string {
  const cdata = xml.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'),
  );
  if (cdata?.[1] != null) return cdata[1].trim();
  const plain = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'),
  );
  return plain?.[1]?.trim() || '';
}
