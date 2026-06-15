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
  };
  github: {
    configured: boolean;
  };
  llm: {
    models: LLMModelInfo[];
    default_model: string;
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

  async retryPipeline(id: string): Promise<{ pipeline_id: string; status: string }> {
    return fetchAPI(`/pipelines/${id}/retry`, {
      method: 'POST',
    });
  },

  async getPipelineMessages(id: string): Promise<{ messages: unknown[] }> {
    return fetchAPI(`/pipelines/${id}/messages`);
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
};
