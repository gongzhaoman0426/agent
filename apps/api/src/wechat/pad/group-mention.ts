/** 群聊 @ 解析与判定 */

export function isChatroomId(id: string): boolean {
  return id.includes('@chatroom');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 群文本常见形态：`senderWxid:\n正文` */
export function parseGroupTextContent(content: string): {
  senderWxid: string;
  body: string;
} {
  const raw = content ?? '';
  const nl = raw.indexOf(':\n');
  if (nl > 0 && nl < 128) {
    return {
      senderWxid: raw.slice(0, nl).trim(),
      body: raw.slice(nl + 2),
    };
  }
  const m = raw.match(/^([^:\n]{1,80}):\s*([\s\S]*)$/);
  if (m) {
    return { senderWxid: m[1].trim(), body: m[2] ?? '' };
  }
  return { senderWxid: '', body: raw };
}

export function extractAtUserList(msgSource: string): string[] {
  if (!msgSource) return [];
  const m = msgSource.match(/<atuserlist>([\s\S]*?)<\/atuserlist>/i);
  if (!m) return [];
  let inner = m[1].trim();
  const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (cdata) inner = cdata[1].trim();
  return inner
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isBotMentioned(input: {
  botWxid: string;
  botNickname?: string;
  msgSource?: string;
  pushContent?: string;
  beAtUser?: string;
  contentBody?: string;
}): boolean {
  const bot = input.botWxid.trim();
  if (!bot) return false;

  const atList = extractAtUserList(input.msgSource ?? '');
  if (atList.includes(bot) || atList.includes('notify@all')) return true;

  const beAt = (input.beAtUser ?? '').trim();
  if (beAt) {
    const parts = beAt.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (
      parts.includes(bot) ||
      parts.includes('notify@all') ||
      beAt === bot ||
      beAt.includes(bot)
    ) {
      return true;
    }
  }

  const push = input.pushContent ?? '';
  if (push.includes('@了你') || /在群聊中\s*@/.test(push)) return true;

  const nick = (input.botNickname ?? '').trim();
  const body = input.contentBody ?? '';
  if (nick) {
    const re = new RegExp(
      `@${escapeRegExp(nick)}([\\s\\u2005\\u00a0]|$)`,
    );
    if (re.test(body)) return true;
  }

  return false;
}

/** 去掉正文里的 @昵称，便于交给模型 */
export function stripAtMentions(body: string, nicknames: string[]): string {
  let text = body ?? '';
  for (const nick of nicknames) {
    const n = nick.trim();
    if (!n) continue;
    text = text.replace(
      new RegExp(`@${escapeRegExp(n)}[\\s\\u2005\\u00a0]*`, 'g'),
      '',
    );
  }
  return text.replace(/^\s+/, '').replace(/\s+$/, '').trim();
}
