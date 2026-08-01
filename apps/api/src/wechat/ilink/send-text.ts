import crypto from 'node:crypto';
import { sendMessage, type WeixinApiOptions } from './api.js';
import {
  MessageItemType,
  MessageState,
  MessageType,
  type SendMessageReq,
} from './types.js';

function generateClientId(): string {
  return `agent-next-weixin:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function sendTextMessage(params: {
  to: string;
  text: string;
  contextToken?: string;
  opts: WeixinApiOptions;
}): Promise<{ messageId: string }> {
  const clientId = generateClientId();
  const text = params.text.trim();
  const body: SendMessageReq = {
    msg: {
      from_user_id: '',
      to_user_id: params.to,
      client_id: clientId,
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: text
        ? [{ type: MessageItemType.TEXT, text_item: { text } }]
        : undefined,
      context_token: params.contextToken,
    },
  };
  await sendMessage({ ...params.opts, body });
  return { messageId: clientId };
}

export function extractTextFromMessage(itemList?: Array<{
  type?: number;
  text_item?: { text?: string };
}>): string {
  if (!itemList?.length) return '';
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      return String(item.text_item.text);
    }
  }
  return '';
}
