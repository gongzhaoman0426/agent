// Auth Types
export interface User {
  id: string;
  username: string;
}

// API Types
export interface Agent {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  options: any;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  agentToolkits?: AgentToolkit[];
  agentKnowledgeBases?: AgentKnowledgeBase[];
  agentWorkflows?: AgentWorkflow[];
}

export interface Toolkit {
  id: string;
  name: string;
  description: string;
  settings: any;
  deleted: boolean;
  tools: Tool[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  schema: any;
  toolkitId: string;
}

export interface AgentToolkit {
  id: string;
  agentId: string;
  toolkitId: string;
  settings: any;
  toolkit: Toolkit;
}

export interface AgentKnowledgeBase {
  id: string;
  agentId: string;
  knowledgeBaseId: string;
  knowledgeBase: KnowledgeBase;
}

export interface AgentWorkflow {
  id: string;
  agentId: string;
  workflowId: string;
  workflow: Workflow;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  DSL: any;
  source?: 'api' | 'code';
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface ToolCallInfo {
  toolId: string;
  toolName: string;
  toolKwargs?: Record<string, any>;
  result?: string;
  status: 'calling' | 'done' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sessionId: string;
  createdAt: string;
  toolCalls?: ToolCallInfo[];
}

export interface ToolkitConfigDto {
  toolkitId: string;
  settings?: any;
}

export interface CreateAgentDto {
  name: string;
  description?: string;
  prompt: string;
  options?: any;
  toolkits?: ToolkitConfigDto[];
  knowledgeBases?: string[];
  workflows?: string[];
}

export interface ChatWithAgentDto {
  message: string;
  sessionId: string;
  context?: any;
  generateTitle?: boolean;
}

export interface GenerateDslDto {
  userMessage: string;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  dsl: any;
}

export interface ExecuteWorkflowDto {
  input: any;
  context?: any;
}

export interface TemporalWorkflowStatus {
  status: string;
  startTime?: string;
  closeTime?: string;
  temporalWorkflowId: string;
}

// Knowledge Base Types
export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  vectorStoreName: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  files?: KnowledgeBaseFile[];
}

export interface KnowledgeBaseFile {
  id: string;
  name: string;
  path: string;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  knowledgeBaseId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeBaseDto {
  name: string;
  description?: string;
}

export interface UpdateKnowledgeBaseDto {
  name?: string;
  description?: string;
}

// Access Token Types
export interface AccessToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface AccessTokenCreateResponse {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

export interface ChatWithKnowledgeBaseDto {
  message: string;
}

// Chat Session Types
export interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  createdAt: string;
  updatedAt: string;
}
