import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertFeishuBotBindingDto {
  @IsString()
  @IsNotEmpty()
  appId: string;

  @IsString()
  @IsOptional()
  appSecret?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export interface FeishuMessageEvent {
  event_id?: string;
  tenant_key?: string;
  app_id?: string;
  sender: {
    sender_type: string;
    sender_id?: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    tenant_key?: string;
  };
  message: {
    message_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    mentions?: Array<{ key?: string }>;
  };
}
