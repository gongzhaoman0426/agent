import type {
  Agent,
  Toolkit,
  Workflow,
  KnowledgeBase,
  TemporalWorkflowStatus,
  CreateAgentDto,
  ChatWithAgentDto,
  ChatSession,
  ChatSessionSummary,
  GenerateDslDto,
  CreateWorkflowDto,
  ExecuteWorkflowDto,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  ChatWithKnowledgeBaseDto
} from '../types';

const API_BASE_URL = '/api';

function clearAuth() {
  localStorage.removeItem('auth_user');
  window.location.href = '/login';
}

interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Exported for potential future use
export type { ApiResponse, PaginatedResponse };

class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const isFormData = options?.body instanceof FormData;
    const defaultHeaders: Record<string, string> = isFormData
      ? {}
      : { 'Content-Type': 'application/json' };

    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          ...defaultHeaders,
          ...options?.headers,
        },
        ...options,
      });

      if (response.status === 401) {
        clearAuth();
        throw new Error('登录已过期，请重新登录');
      }

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = await response.text() || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  // GET 请求
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return this.request<T>(query ? `${endpoint}?${query}` : endpoint);
  }

  // POST 请求
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PUT 请求
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // DELETE 请求
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // Agent APIs
  async getAgents(): Promise<Agent[]> {
    return this.get<Agent[]>('agents');
  }

  async getAgent(id: string): Promise<Agent> {
    return this.get<Agent>(`agents/${id}`);
  }

  async createAgent(data: CreateAgentDto): Promise<Agent> {
    return this.post<Agent>('agents', data);
  }

  async updateAgent(id: string, data: Partial<CreateAgentDto>): Promise<Agent> {
    return this.put<Agent>(`agents/${id}`, data);
  }

  async deleteAgent(id: string): Promise<void> {
    return this.delete<void>(`agents/${id}`);
  }

  async chatWithAgent(id: string, data: ChatWithAgentDto): Promise<any> {
    return this.post<any>(`agents/${id}/chat`, data);
  }

  async streamChatWithAgent(
    id: string,
    data: ChatWithAgentDto,
    callbacks: {
      onDelta: (delta: string) => void;
      onToolCall?: (data: { toolId: string; toolName: string; toolKwargs: Record<string, any> }) => void;
      onToolResult?: (data: { toolId: string; toolName: string; result: string }) => void;
    },
    signal?: AbortSignal,
  ): Promise<{ response: string; title?: string; agentId: string; agentName: string }> {
    const url = `${API_BASE_URL}/agents/${id}/chat/stream`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal,
    });
    if (res.status === 401) {
      clearAuth();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const e = await res.json(); msg = e.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneData: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 事件
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // 保留未完成的行
      let eventName = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7);
        } else if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            if (eventName === 'delta') {
              callbacks.onDelta(parsed.delta);
            } else if (eventName === 'tool_call') {
              callbacks.onToolCall?.(parsed);
            } else if (eventName === 'tool_result') {
              callbacks.onToolResult?.(parsed);
            } else if (eventName === 'done') {
              doneData = parsed;
            }
          } catch { /* ignore parse errors */ }
          eventName = '';
        }
      }
    }

    return doneData || { response: '', agentId: id, agentName: '' };
  }

  // Chat Session APIs
  async getAllChatSessions(): Promise<ChatSessionSummary[]> {
    return this.get<ChatSessionSummary[]>('agents/sessions/all');
  }

  async getAgentSessions(agentId: string): Promise<ChatSessionSummary[]> {
    return this.get<ChatSessionSummary[]>(`agents/${agentId}/sessions`);
  }

  async getSession(agentId: string, sessionId: string): Promise<ChatSession> {
    return this.get<ChatSession>(`agents/${agentId}/sessions/${sessionId}`);
  }

  async deleteSession(agentId: string, sessionId: string): Promise<void> {
    return this.delete<void>(`agents/${agentId}/sessions/${sessionId}`);
  }

  // Toolkit APIs
  async getToolkits(): Promise<Toolkit[]> {
    return this.get<Toolkit[]>('toolkits');
  }

  async getToolkitSettings(toolkitId: string): Promise<any> {
    return this.get<any>(`toolkits/${toolkitId}/settings`);
  }

  async updateToolkitSettings(toolkitId: string, settings: any): Promise<any> {
    return this.put<any>(`toolkits/${toolkitId}/settings`, { settings });
  }

  // Workflow APIs
  async getWorkflows(): Promise<Workflow[]> {
    return this.get<Workflow[]>('workflows');
  }

  async getWorkflow(id: string): Promise<Workflow> {
    return this.get<Workflow>(`workflows/${id}`);
  }

  async generateDsl(data: GenerateDslDto): Promise<{ dsl: any }> {
    return this.post<{ dsl: any }>('workflows/generate-dsl', data);
  }

  async createWorkflow(data: CreateWorkflowDto): Promise<Workflow> {
    return this.post<Workflow>('workflows', data);
  }

  async executeWorkflow(id: string, data: ExecuteWorkflowDto): Promise<any> {
    return this.post<any>(`workflows/${id}/execute`, data);
  }

  async getTemporalWorkflowStatus(temporalWorkflowId: string): Promise<TemporalWorkflowStatus> {
    return this.get<TemporalWorkflowStatus>(`workflows/temporal/${temporalWorkflowId}/status`);
  }

  async getTemporalWorkflowResult(temporalWorkflowId: string): Promise<any> {
    return this.get<any>(`workflows/temporal/${temporalWorkflowId}/result`);
  }

  async cancelTemporalWorkflow(temporalWorkflowId: string): Promise<any> {
    return this.post<any>(`workflows/temporal/${temporalWorkflowId}/cancel`, {});
  }

  async deleteWorkflow(id: string): Promise<void> {
    return this.delete<void>(`workflows/${id}`);
  }

  // Knowledge Base APIs
  async getKnowledgeBases(): Promise<KnowledgeBase[]> {
    return this.get<KnowledgeBase[]>('knowledge-base');
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase> {
    return this.get<KnowledgeBase>(`knowledge-base/${id}`);
  }

  async createKnowledgeBase(data: CreateKnowledgeBaseDto): Promise<KnowledgeBase> {
    return this.post<KnowledgeBase>('knowledge-base', data);
  }

  async updateKnowledgeBase(id: string, data: UpdateKnowledgeBaseDto): Promise<KnowledgeBase> {
    return this.put<KnowledgeBase>(`knowledge-base/${id}`, data);
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    return this.delete<void>(`knowledge-base/${id}`);
  }

  async uploadFileToKnowledgeBase(knowledgeBaseId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<any>(`knowledge-base/${knowledgeBaseId}/files`, {
      method: 'POST',
      body: formData,
    });
  }

  async trainKnowledgeBaseFile(knowledgeBaseId: string, fileId: string): Promise<any> {
    return this.post<any>(`knowledge-base/${knowledgeBaseId}/files/${fileId}/train`);
  }

  async deleteKnowledgeBaseFile(knowledgeBaseId: string, fileId: string): Promise<void> {
    return this.delete<void>(`knowledge-base/${knowledgeBaseId}/files/${fileId}`);
  }

  async queryKnowledgeBase(knowledgeBaseId: string, data: ChatWithKnowledgeBaseDto): Promise<any> {
    return this.post<any>(`knowledge-base/${knowledgeBaseId}/query`, data);
  }

  async linkKnowledgeBaseToAgent(knowledgeBaseId: string, agentId: string): Promise<any> {
    return this.post<any>(`knowledge-base/${knowledgeBaseId}/agents`, { agentId });
  }

  async unlinkKnowledgeBaseFromAgent(knowledgeBaseId: string, agentId: string): Promise<void> {
    return this.delete<void>(`knowledge-base/${knowledgeBaseId}/agents/${agentId}`);
  }
}

export const apiClient = new ApiClient();
