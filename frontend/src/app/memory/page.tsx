'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/common/Sidebar';
import { api } from '@/lib/api';

interface MemoryData {
  repo_url: string;
  memory: Record<string, Array<{
    id: string;
    content: string;
    relevance_score: number;
    created_at: string;
    metadata: Record<string, unknown>;
  }>>;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  pattern: { icon: '🔷', color: '#6366f1', label: 'Patterns' },
  convention: { icon: '📏', color: '#10b981', label: 'Conventions' },
  decision: { icon: '⚡', color: '#f59e0b', label: 'Decisions' },
  lesson: { icon: '📚', color: '#ec4899', label: 'Lessons Learned' },
};

export default function MemoryPage() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/example/demo-repo');
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCategory, setNewCategory] = useState('convention');
  const [newContent, setNewContent] = useState('');

  const fetchMemory = async () => {
    setLoading(true);
    try {
      const data = await api.getMemory(repoUrl);
      setMemory(data as MemoryData);
    } catch (err) {
      console.error('Failed to fetch memory:', err);
      setMemory(null);
    } finally {
      setLoading(false);
    }
  };

  const addMemory = async () => {
    if (!newContent.trim()) return;
    try {
      await api.addMemory(repoUrl, newCategory, newContent);
      setNewContent('');
      fetchMemory();
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const demoMemories: MemoryData = {
    repo_url: repoUrl,
    memory: {
      pattern: [
        { id: '1', content: 'This repo uses repository pattern for database access', relevance_score: 0.9, created_at: new Date().toISOString(), metadata: {} },
        { id: '2', content: 'Authentication uses JWT with refresh token rotation', relevance_score: 0.85, created_at: new Date().toISOString(), metadata: {} },
        { id: '3', content: 'API responses follow { success, data, error } envelope pattern', relevance_score: 0.8, created_at: new Date().toISOString(), metadata: {} },
      ],
      convention: [
        { id: '4', content: 'Use snake_case for Python files, camelCase for TypeScript', relevance_score: 0.95, created_at: new Date().toISOString(), metadata: {} },
        { id: '5', content: 'All API routes prefixed with /api/v1/', relevance_score: 0.9, created_at: new Date().toISOString(), metadata: {} },
        { id: '6', content: 'Prefer hooks over class components in React code', relevance_score: 0.85, created_at: new Date().toISOString(), metadata: {} },
      ],
      decision: [
        { id: '7', content: 'Chose PostgreSQL over MySQL for JSON support', relevance_score: 0.8, created_at: new Date().toISOString(), metadata: {} },
        { id: '8', content: 'Using FastAPI for async support and auto-generated docs', relevance_score: 0.75, created_at: new Date().toISOString(), metadata: {} },
      ],
      lesson: [
        { id: '9', content: 'Previous fix: null check required before accessing user.session', relevance_score: 0.95, created_at: new Date().toISOString(), metadata: {} },
        { id: '10', content: 'Migration scripts must be idempotent — caused prod incident once', relevance_score: 0.92, created_at: new Date().toISOString(), metadata: {} },
      ],
    },
  };

  const displayMemory = memory?.memory && Object.keys(memory.memory).length > 0 ? memory : demoMemories;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">🧠 Codebase Memory</h1>
            <p className="text-am-muted mt-1">Persistent learnings that improve future agent decisions</p>
          </div>

          {/* Repo selector */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-am-card border border-am-border rounded-lg text-white text-sm focus:outline-none focus:border-am-accent"
              placeholder="Repository URL"
            />
            <button
              onClick={fetchMemory}
              disabled={loading}
              className="px-5 py-2.5 bg-am-accent text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load Memory'}
            </button>
          </div>

          {/* Memory categories */}
          <div className="grid gap-6 md:grid-cols-2">
            {Object.entries(displayMemory.memory).map(([category, entries]) => {
              const config = CATEGORY_CONFIG[category] || { icon: '📌', color: '#9ca3af', label: category };
              return (
                <div key={category} className="bg-am-card rounded-xl border border-am-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">{config.icon}</span>
                    <h3 className="text-white font-semibold">{config.label}</h3>
                    <span className="text-xs px-2 py-0.5 bg-am-dark rounded text-am-muted ml-auto">
                      {entries.length} entries
                    </span>
                  </div>
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div key={entry.id} className="p-3 bg-am-dark rounded-lg border border-am-border/50">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-300">{entry.content}</p>
                          <span className="text-[10px] text-am-muted shrink-0">
                            {(entry.relevance_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-2 h-1 bg-am-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${entry.relevance_score * 100}%`,
                              backgroundColor: config.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add memory */}
          <div className="mt-6 bg-am-card rounded-xl border border-am-border p-5">
            <h3 className="text-white font-semibold mb-3">➕ Add Manual Memory</h3>
            <div className="flex gap-3">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-3 py-2 bg-am-dark border border-am-border rounded-lg text-white text-sm focus:outline-none"
              >
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.icon} {config.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What should the AI remember about this repo?"
                className="flex-1 px-4 py-2 bg-am-dark border border-am-border rounded-lg text-white text-sm focus:outline-none focus:border-am-accent"
              />
              <button
                onClick={addMemory}
                disabled={!newContent.trim()}
                className="px-5 py-2 bg-am-accent text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
