import { PipelineRun, PipelineListItem } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const TOKEN_KEY = 'automaintainer_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options?.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export interface LLMModelInfo {
  alias: string;
  model: string;
  base_url: string;
  is_default: boolean;
}

export interface SystemStatus {
  backend: {
    status: string;
    auth_enabled: boolean;
    max_concurrent_pipelines: number;
    pipeline_timeout_seconds: number;
    agent_timeouts?: Record<string, number>;
  };
  github: {
    configured: boolean;
  };
  llm: {
    models: LLMModelInfo[];
    default_model: string;
    agent_models?: Record<string, string>;
  };
  pipelines: {
    total: number;
    active: number;
    running_tasks: number;
  };
}

export const api = {
  async login(username: string, password: string): Promise<{ access_token: string; token_type: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `Login failed: ${res.status}`);
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return data;
  },

  async startPipeline(data: {
    repo_url: string;
    issue_url: string;
    issue_number: number;
    issue_title: string;
    issue_body: string;
    custom_instructions?: string;
  }): Promise<{ pipeline_id: string; status: string }> {
    return fetchAPI('/pipelines/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async startDemoPipeline(data?: {
    repo_url?: string;
    issue_number?: number;
    issue_title?: string;
    issue_body?: string;
  }): Promise<{ pipeline_id: string; status: string }> {
    return fetchAPI('/pipelines/demo', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  async listPipelines(): Promise<{ pipelines: PipelineListItem[] }> {
    return fetchAPI('/pipelines');
  },

  async getPipeline(id: string): Promise<PipelineRun> {
    return fetchAPI(`/pipelines/${id}`);
  },

  async approvePipeline(id: string, reason?: string): Promise<{ status: string; pr_url?: string }> {
    return fetchAPI(`/pipelines/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    });
  },

  async rejectPipeline(id: string, reason?: string): Promise<{ status: string }> {
    return fetchAPI(`/pipelines/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    });
  },

  async deletePipeline(id: string): Promise<{ deleted: boolean }> {
    return fetchAPI(`/pipelines/${id}`, {
      method: 'DELETE',
    });
  },

  async retryPipeline(id: string, customInstructions?: string): Promise<{ pipeline_id: string; status: string }> {
    return fetchAPI(`/pipelines/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify({ custom_instructions: customInstructions || '' }),
    });
  },

  async stopPipeline(id: string): Promise<{ status: string; message: string }> {
    return fetchAPI(`/pipelines/${id}/stop`, {
      method: 'POST',
    });
  },

  async getPipelineMessages(id: string): Promise<{ messages: unknown[] }> {
    return fetchAPI(`/pipelines/${id}/messages`);
  },

  getPipelineEventsUrl(id: string): string {
    return `${API_BASE}/pipelines/${id}/events`;
  },

  async getMemory(repoUrl: string): Promise<{ repo_url: string; memory: Record<string, unknown[]> }> {
    const encoded = repoUrl.replace('https://github.com/', '');
    return fetchAPI(`/memory/${encoded}`);
  },

  async addMemory(repoUrl: string, category: string, content: string): Promise<unknown> {
    return fetchAPI('/memory', {
      method: 'POST',
      body: JSON.stringify({ repo_url: repoUrl, category, content }),
    });
  },

  async getSystemStatus(): Promise<SystemStatus> {
    return fetchAPI('/system/status');
  },

  async healthCheck(): Promise<{ status: string }> {
    return fetchAPI('/health');
  },

  async listUserRepos(): Promise<{ repos: { name: string; full_name: string; url: string; description: string; private: boolean }[] }> {
    return fetchAPI('/repos');
  },

  async getAdminUsers(): Promise<AdminUsersResponse> {
    return fetchAPI('/admin/users');
  },

  async getAdminStats(): Promise<AdminStatsResponse> {
    return fetchAPI('/admin/stats');
  },

  async getAgentModels(): Promise<AgentModelsResponse> {
    return fetchAPI('/system/agent-models');
  },

  async updateAgentModels(agentModels: Record<string, string>): Promise<AgentModelsResponse> {
    return fetchAPI('/system/agent-models', {
      method: 'PUT',
      body: JSON.stringify({ agent_models: agentModels }),
    });
  },

  async getAgentTimeouts(): Promise<{ timeouts: Record<string, number>; limits: { min: number; max: number } }> {
    return fetchAPI('/system/agent-timeouts');
  },

  async updateAgentTimeouts(timeouts: Record<string, number>): Promise<{ timeouts: Record<string, number>; limits: { min: number; max: number } }> {
    return fetchAPI('/system/agent-timeouts', {
      method: 'PUT',
      body: JSON.stringify({ timeouts }),
    });
  },
};

export interface AgentModelsResponse {
  agent_models: Record<string, string>;
  available_models: LLMModelInfo[];
}

export interface AdminUser {
  id: string;
  github_username: string;
  github_id: number;
  avatar_url: string | null;
  created_at: string | null;
  last_active: string | null;
}

export interface AdminUsersResponse {
  total_users: number;
  users: AdminUser[];
}

export interface AdminStatsResponse {
  users: { total: number };
  pipelines: {
    total: number;
    successful: number;
    failed: number;
    active: number;
    success_rate: number;
  };
  repos: { unique: number };
  system: {
    models_configured: number;
    max_concurrent: number;
  };
}
