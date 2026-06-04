'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/common/Sidebar';
import PipelineCard from '@/components/dashboard/PipelineCard';
import QuickStartPanel from '@/components/dashboard/QuickStartPanel';
import AgentStatusGrid from '@/components/dashboard/AgentStatusGrid';
import StatsOverview from '@/components/dashboard/StatsOverview';
import { api } from '@/lib/api';
import { PipelineListItem } from '@/types';

export default function DashboardPage() {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPipelines = useCallback(async () => {
    try {
      const data = await api.listPipelines();
      setPipelines(data.pipelines);
      setError(null);
    } catch (err) {
      setError('Failed to load pipelines. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipelines();
    const interval = setInterval(fetchPipelines, 5000);
    return () => clearInterval(interval);
  }, [fetchPipelines]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
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
                    <div className="h-4 bg-am-border rounded w-3/4 mb-3" />
                    <div className="h-3 bg-am-border rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-am-muted text-lg mb-2">⚠️ {error}</p>
                <p className="text-am-muted text-sm">Start the backend with <code className="text-am-accent">cd backend && uvicorn main:app --reload</code></p>
              </div>
            ) : pipelines.length === 0 ? (
              <div className="glass rounded-xl p-12 text-center">
                <p className="text-4xl mb-4">🚀</p>
                <p className="text-white text-lg font-medium mb-2">No pipelines yet</p>
                <p className="text-am-muted">Click &quot;Run Demo Pipeline&quot; to see the AI engineering team in action</p>
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
