'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/common/Sidebar';
import StatusBadge from '@/components/common/StatusBadge';
import { api } from '@/lib/api';
import { PipelineListItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listPipelines().then((data) => {
      setPipelines(data.pipelines);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">All Pipelines</h1>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-am-card rounded-xl border border-am-border p-5 animate-pulse">
                  <div className="h-4 bg-am-border rounded w-2/3 mb-2" />
                  <div className="h-3 bg-am-border rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : pipelines.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <p className="text-4xl mb-4">🔄</p>
              <p className="text-white text-lg font-medium">No pipelines yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelines.map((p) => (
                <Link key={p.id} href={`/pipelines/${p.id}`}>
                  <div className="bg-am-card rounded-xl border border-am-border p-5 hover:border-am-accent/30 transition-all cursor-pointer group">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium group-hover:text-am-accent-light transition-colors">
                          #{p.issue_number} {p.issue_title}
                        </h3>
                        <p className="text-am-muted text-sm mt-1">{p.repo_url}</p>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        {p.review_score != null && (
                          <span className="text-sm text-am-muted">⭐ {p.review_score.toFixed(1)}</span>
                        )}
                        <span className="text-sm text-am-muted">📄 {p.files_changed}</span>
                        <span className="text-sm text-am-muted">🧪 {p.tests_passed}/{p.tests_total}</span>
                        <StatusBadge status={p.status} />
                        <span className="text-xs text-am-muted">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
