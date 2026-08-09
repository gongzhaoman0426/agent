export interface AgentToolkitMount {
  toolkitId: string;
  toolkit?: Toolkit;
}

export interface AgentWorkflowMount {
  workflowId: string;
  workflow?: Workflow;
}

export interface AgentSkillMount {
  skillName: string;
}

export interface AgentSubAgentMount {
  childId: string;
  child: { id: string; name: string; description?: string | null };
}

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
  agentToolkits: AgentToolkitMount[];
  agentWorkflows: AgentWorkflowMount[];
  agentSkills: AgentSkillMount[];
  subAgents: AgentSubAgentMount[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown> | null;
}

/** 工具包配置项，值统一为字符串 */
export interface SettingField {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
}

export interface Toolkit {
  id: string;
  name: string;
  description: string;
  settingsFields?: SettingField[] | null;
  /** 必填 settings 是否已配齐；无必填项时恒为 true */
  settingsReady?: boolean;
  /** code = 内置；mcp = 用户远程 Minimal MCP */
  source?: 'code' | 'mcp';
  mcpError?: string | null;
  tools: Tool[];
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  toolkitId: string;
  toolCount: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
  ready: boolean;
  tools: Array<{ id: string; name: string; description: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown> | null;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  hasScripts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillSummary {
  content: string;
  references: string[];
  scripts: string[];
}

export interface SkillFileNode {
  /** 相对技能根目录的路径，如 scripts/run.js */
  path: string;
  size: number;
  editable: boolean;
  updatedAt: string;
}

export interface SkillFileContent {
  path: string;
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolCallInfo {
  toolId: string;
  toolName: string;
  toolKwargs?: Record<string, unknown>;
  result?: unknown;
  done: boolean;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ToolCallInfo };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
}

export interface SessionDetail extends ChatSession {
  messages: UiMessage[];
}

export interface WechatAccount {
  id: string;
  userId: string;
  agentId: string;
  wxid: string;
  nickname: string;
  proxy: string;
  deviceWay: string;
  enabled: boolean;
  autoReplyPaused?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WechatInboxConversation {
  sessionId: string;
  title: string;
  agentId: string;
  agentName: string;
  peerWxid: string;
  isGroup: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface WechatInboxList {
  account: WechatAccount;
  autoReplyPaused: boolean;
  conversations: WechatInboxConversation[];
}

export interface WechatInboxMessages {
  accountId: string;
  agentId: string;
  peerWxid: string;
  isGroup: boolean;
  autoReplyPaused: boolean;
  sessionId: string;
  title: string;
  messages: UiMessage[];
}

export interface WechatPeerProfile {
  peerWxid: string;
  isGroup: boolean;
  profile: {
    userName: string;
    nickName: string;
    remark: string;
    alias: string;
    displayName: string;
  };
}

export interface WechatLoginStart {
  sessionKey: string;
  qrcodeUrl?: string;
  message: string;
}

export interface WechatLoginStatus {
  status: string;
  qrcodeUrl?: string;
  connected?: boolean;
  wxid?: string;
  nickname?: string;
  verificationUrl?: string;
  needsPhoneCode?: boolean;
  message: string;
}

/** 定时任务（Web inbox / 工具返回结构） */
export interface ScheduledTask {
  id: string;
  agentId: string;
  message: string;
  channel: string;
  sessionId: string;
  runAt: string;
  status: string;
  resultText?: string | null;
  errorMessage?: string | null;
  deliveredAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}


export interface OperatorAccount {
  id: string;
  name: string;
  username: string;
  role: 'operator';
  accountIds: string[];
  createdAt?: string;
  updatedAt?: string;
}
