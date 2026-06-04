import { PipelineRun, PipelineListItem } from '@/types';

const API_BASE = '/api';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
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

  async healthCheck(): Promise<{ status: string }> {
    return fetchAPI('/health');
  },
};
