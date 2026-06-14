'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/common/Sidebar';
import { api } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import Link from 'next/link';
import { ChevronRight, Brain, Diamond, Ruler, Zap, BookOpen, Pin, Plus, Loader2, Save } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

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

const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  pattern: { icon: Diamond, color: '#6366f1', label: 'Patterns' },
  convention: { icon: Ruler, color: '#10b981', label: 'Conventions' },
  decision: { icon: Zap, color: '#f59e0b', label: 'Decisions' },
  lesson: { icon: BookOpen, color: '#ec4899', label: 'Lessons Learned' },
};

export default function MemoryPage() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/example/demo-repo');
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCategory, setNewCategory] = useState('convention');
  const [newContent, setNewContent] = useState('');
  const { toast } = useToast();

  const fetchMemory = async () => {
    setLoading(true);
    try {
      const data = await api.getMemory(repoUrl);
      setMemory(data as MemoryData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast(`Failed to load memory: ${msg}`, 'error');
      setMemory(null);
    } finally {
      setLoading(false);
    }
  };

  const addMemory = async () => {
    if (!newContent.trim()) return;
    try {
      await api.addMemory(repoUrl, newCategory, newContent);
      toast('Memory saved successfully!', 'success');
      setNewContent('');
      fetchMemory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast(`Failed to save memory: ${msg}`, 'error');
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const hasMemory = memory?.memory && Object.keys(memory.memory).length > 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-5xl mx-auto pt-8 md:pt-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-am-muted mb-6">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">Memory</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Brain size={28} className="text-am-accent" />
              Codebase Memory
            </h1>
            <p className="text-am-muted mt-1">Persistent learnings that improve future agent decisions</p>
          </div>

          {/* Repo selector */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-am-card border border-am-border rounded-lg text-white text-sm focus:outline-none focus:border-am-accent transition-colors"
              placeholder="Repository URL"
            />
            <button
              onClick={fetchMemory}
              disabled={loading}
              className="px-5 py-2.5 bg-am-accent text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-all"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Loading...' : 'Load Memory'}
            </button>
          </div>

          {/* Memory categories */}
          {!hasMemory && !loading && (
            <div className="glass rounded-xl p-8 text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-am-accent/10 flex items-center justify-center mx-auto mb-3">
                <Brain size={24} className="text-am-accent" />
              </div>
              <p className="text-white font-medium">No memories yet</p>
              <p className="text-am-muted text-sm mt-1">Run a pipeline to build up learnings for this repository</p>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            {hasMemory && Object.entries(memory.memory).map(([category, entries]) => {
              const config = CATEGORY_CONFIG[category] || { icon: Pin, color: '#9ca3af', label: category };
              const Icon = config.icon;
              return (
                <div key={category} className="bg-am-card rounded-xl border border-am-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}15` }}>
                      <Icon size={16} style={{ color: config.color }} />
                    </div>
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
                            className="h-full rounded-full transition-all duration-500"
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
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Plus size={16} className="text-am-accent" />
              Add Manual Memory
            </h3>
            <div className="flex gap-3">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-3 py-2 bg-am-dark border border-am-border rounded-lg text-white text-sm focus:outline-none"
              >
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What should the AI remember about this repo?"
                className="flex-1 px-4 py-2 bg-am-dark border border-am-border rounded-lg text-white text-sm focus:outline-none focus:border-am-accent transition-colors"
              />
              <button
                onClick={addMemory}
                disabled={!newContent.trim()}
                className="px-5 py-2 bg-am-accent text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-all"
              >
                <Save size={14} />
                Save
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
