/** wechat-v875 通用响应（见 /docs/） */
export type PadDto<T = unknown> = {
  Code: number;
  Data: T;
  Text?: string;
  Data62?: string;
};

/** POST /admin/GenAuthKey1 → Data */
export type GenAuthKeyData = string[];

/** POST /login/GetLoginQrCodeNewX → Data */
export type LoginQrData = {
  DeviceId?: string;
  Key?: string;
  QrCodeUrl?: string;
  Txt?: string;
  baseResp?: { ret?: number; errMsg?: unknown };
};

/**
 * GET /login/CheckLoginStatus → Data
 * state: 0 待扫码 / 1 已扫码待确认 / 2 已确认（可能仍需安全验证）
 * loginState: online 表示长连接已上线
 */
export type CheckLoginStatusData = {
  uuid?: string;
  state?: number;
  loginState?: string;
  wxid?: string;
  nick_name?: string;
  device?: string;
  ret?: number;
  msg?: string;
  ticket?: string;
  VerificationUrl?: string;
  effective_time?: number;
  push_login_url_expired_time?: number;
  data62?: string;
};

/** SyncMessageResponse / AddMsg 的松散 JSON 形态 */
export type PadSyncBatch = {
  Type?: number;
  UUID?: string;
  userName?: string;
  UserName?: string;
  AddMsgs?: PadAddMsg[];
  addMsgs?: PadAddMsg[];
};

export type PadAddMsg = {
  fromUserName?: { str?: string; Str?: string } | string;
  FromUserName?: { str?: string; Str?: string } | string;
  from_user_name?: { str?: string; Str?: string } | string;
  toUserName?: { str?: string; Str?: string } | string;
  ToUserName?: { str?: string; Str?: string } | string;
  to_user_name?: { str?: string; Str?: string } | string;
  msgType?: number;
  MsgType?: number;
  msg_type?: number;
  content?: { str?: string; Str?: string } | string;
  Content?: { str?: string; Str?: string } | string;
  msg_id?: number | string;
  msgId?: number | string;
  new_msg_id?: number | string;
  newMsgId?: number | string;
};

export type ParsedPadMessage = {
  fromWxid: string;
  toWxid: string;
  msgType: number;
  content: string;
  msgId?: string;
};
