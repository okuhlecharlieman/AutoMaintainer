'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/common/Sidebar';
import PipelineCard from '@/components/dashboard/PipelineCard';
import QuickStartPanel from '@/components/dashboard/QuickStartPanel';
import AgentStatusGrid from '@/components/dashboard/AgentStatusGrid';
import StatsOverview from '@/components/dashboard/StatsOverview';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/common/Toast';
import { PipelineListItem } from '@/types';
import { Rocket, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const fetchPipelines = useCallback(async () => {
    try {
      const data = await api.listPipelines();
      setPipelines(data.pipelines);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Session expired')) {
        logout();
        router.replace('/login');
        return;
      }
      setError('Failed to load pipelines. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [logout, router]);

  useEffect(() => {
    fetchPipelines();
    const interval = setInterval(fetchPipelines, 5000);
    return () => clearInterval(interval);
  }, [fetchPipelines]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-8 md:pt-0">
            <div>
              <h1 className="text-3xl font-bold text-white">Dashboard</h1>
              <p className="text-am-muted mt-1">Autonomous engineering operations at a glance</p>
            </div>
            <QuickStartPanel onPipelineStarted={fetchPipelines} />
          </div>

          {/* Stats */}
          <StatsOverview pipelines={pipelines} />

          {/* Agent Status */}
          <AgentStatusGrid pipelines={pipelines} />

          {/* Recent Pipelines */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Recent Pipelines</h2>
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-am-card rounded-xl border border-am-border p-6 animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-am-border rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-am-border rounded w-3/4 mb-2" />
                        <div className="h-3 bg-am-border rounded w-1/2" />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="h-3 bg-am-border rounded w-16" />
                      <div className="h-3 bg-am-border rounded w-16" />
                      <div className="h-3 bg-am-border rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="glass rounded-xl p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={24} className="text-amber-400" />
                </div>
                <p className="text-white font-medium text-lg mb-2">Connection Error</p>
                <p className="text-am-muted text-sm mb-4">{error}</p>
                <p className="text-am-muted text-xs">Start the backend with <code className="text-am-accent bg-am-accent/10 px-2 py-0.5 rounded">cd backend && uvicorn main:app --reload</code></p>
              </div>
            ) : pipelines.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-am-accent/20 to-purple-600/20 flex items-center justify-center mx-auto mb-4">
                  <Rocket size={28} className="text-am-accent-light" />
                </div>
                <p className="text-white text-lg font-medium mb-2">No pipelines yet</p>
                <p className="text-am-muted text-sm max-w-md mx-auto">
                  Click &quot;Run Demo Pipeline&quot; above to see your AI engineering team analyze, code, test, and review a GitHub issue end-to-end.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pipelines.map((p) => (
                  <PipelineCard key={p.id} pipeline={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
