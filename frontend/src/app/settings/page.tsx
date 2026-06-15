'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/common/Sidebar';
import { api, SystemStatus } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import Link from 'next/link';
import {
  ChevronRight, Settings, Server, Github, Cpu, BarChart3,
  CheckCircle, XCircle, Loader2, RefreshCw, Shield, Clock,
} from 'lucide-react';

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSystemStatus();
      setStatus(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto pt-8 md:pt-0">
          <nav className="flex items-center gap-1.5 text-sm text-am-muted mb-6">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">Settings</span>
          </nav>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Settings size={28} className="text-am-accent" />
                System Settings
              </h1>
              <p className="text-am-muted mt-1">Backend configuration and system health</p>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-4 py-2 bg-am-card border border-am-border rounded-lg text-gray-300 text-sm hover:border-am-accent/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {error ? (
            <div className="glass rounded-xl p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <XCircle size={24} className="text-red-400" />
              </div>
              <p className="text-white font-medium mb-2">Backend Unreachable</p>
              <p className="text-am-muted text-sm mb-4">{error}</p>
              <p className="text-am-muted text-xs">
                Start the backend with{' '}
                <code className="text-am-accent bg-am-accent/10 px-2 py-0.5 rounded">
                  cd backend && uvicorn main:app --reload
                </code>
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-am-accent" />
            </div>
          ) : status && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Backend Status */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-am-accent/10 flex items-center justify-center">
                    <Server size={20} className="text-am-accent" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Backend Server</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-am-success animate-pulse" />
                      <span className="text-xs text-am-success">Online</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-2">
                      <Shield size={14} /> Auth
                    </span>
                    <span className={status.backend.auth_enabled ? 'text-am-success' : 'text-amber-400'}>
                      {status.backend.auth_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-2">
                      <BarChart3 size={14} /> Max Concurrent
                    </span>
                    <span className="text-white">{status.backend.max_concurrent_pipelines}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-2">
                      <Clock size={14} /> Pipeline Timeout
                    </span>
                    <span className="text-white">{status.backend.pipeline_timeout_seconds}s</span>
                  </div>
                </div>
              </div>

              {/* GitHub Integration */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center">
                    <Github size={20} className="text-gray-300" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">GitHub Integration</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {status.github.configured ? (
                        <>
                          <CheckCircle size={12} className="text-am-success" />
                          <span className="text-xs text-am-success">Token configured</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={12} className="text-amber-400" />
                          <span className="text-xs text-amber-400">No token set</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  {status.github.configured
                    ? 'GitHub token is configured. Pipelines can fetch repos, create branches, and open PRs.'
                    : 'Set GITHUB_TOKEN in your .env to enable repo access and PR creation. Demo pipelines still work without it.'
                  }
                </p>
              </div>

              {/* LLM Models */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Cpu size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">LLM Models</h3>
                    <span className="text-xs text-am-muted">
                      Default: <span className="text-purple-400">{status.llm.default_model}</span>
                    </span>
                  </div>
                </div>
                {status.llm.models.length > 0 ? (
                  <div className="space-y-2">
                    {status.llm.models.map((model) => (
                      <div key={model.alias} className="flex items-center justify-between p-2.5 bg-am-dark rounded-lg border border-am-border/50">
                        <div>
                          <span className="text-sm text-white font-mono">{model.alias}</span>
                          <span className="text-xs text-am-muted ml-2">{model.model}</span>
                        </div>
                        {model.is_default && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded font-medium">default</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">
                    No LLM models configured. Set DASHSCOPE_API_KEY or LLM_MODELS in your .env file.
                  </p>
                )}
              </div>

              {/* Pipeline Stats */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <BarChart3 size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Pipeline Overview</h3>
                    <span className="text-xs text-am-muted">Current system load</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-am-dark rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-white">{status.pipelines.total}</p>
                    <p className="text-xs text-am-muted">Total</p>
                  </div>
                  <div className="bg-am-dark rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-am-accent">{status.pipelines.active}</p>
                    <p className="text-xs text-am-muted">Active</p>
                  </div>
                  <div className="bg-am-dark rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{status.pipelines.running_tasks}</p>
                    <p className="text-xs text-am-muted">Running</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
