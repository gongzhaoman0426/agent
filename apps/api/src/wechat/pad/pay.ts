import { padRequest } from './client.js';

/** POST /pay/Collectmoney — 确定收款（收转账） */
export async function collectMoney(input: {
  authKey: string;
  invalidTime: string;
  transferId: string;
  transactionId: string;
  toUserName: string;
}): Promise<unknown> {
  return padRequest('POST', '/pay/Collectmoney', {
    key: input.authKey,
    body: {
      InvalidTime: input.invalidTime,
      TransFerId: input.transferId,
      TransactionId: input.transactionId,
      ToUserName: input.toUserName,
    },
  });
}
