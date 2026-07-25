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
  tools: Tool[];
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
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }>;
}
