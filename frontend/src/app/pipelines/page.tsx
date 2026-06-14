'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/common/Sidebar';
import StatusBadge from '@/components/common/StatusBadge';
import { api } from '@/lib/api';
import { PipelineListItem, PipelineStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Search, Star, FileText, FlaskConical, Clock, Filter, GitBranch } from 'lucide-react';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'merged', label: 'Merged' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    api.listPipelines().then((data) => {
      setPipelines(data.pipelines);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredPipelines = useMemo(() => {
    return pipelines.filter((p) => {
      const matchesSearch = searchQuery === '' ||
        p.issue_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.repo_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `#${p.issue_number}`.includes(searchQuery);

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && !['merged', 'rejected', 'failed'].includes(p.status)) ||
        (statusFilter === 'merged' && p.status === 'merged') ||
        (statusFilter === 'failed' && p.status === 'failed') ||
        (statusFilter === 'rejected' && p.status === 'rejected');

      return matchesSearch && matchesStatus;
    });
  }, [pipelines, searchQuery, statusFilter]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-5xl mx-auto pt-8 md:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-white">All Pipelines</h1>
            <span className="text-am-muted text-sm">{filteredPipelines.length} of {pipelines.length} pipelines</span>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pipelines by title, repo, or issue number..."
                className="w-full pl-10 pr-4 py-2.5 bg-am-card border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 bg-am-card border border-am-border rounded-lg p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === f.value
                      ? 'bg-am-accent/20 text-am-accent-light'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-am-card rounded-xl border border-am-border p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-am-border rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 bg-am-border rounded w-2/3 mb-2" />
                      <div className="h-3 bg-am-border rounded w-1/3" />
                    </div>
                    <div className="h-6 bg-am-border rounded-full w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPipelines.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-am-accent/10 flex items-center justify-center mx-auto mb-4">
                <GitBranch size={24} className="text-am-accent" />
              </div>
              <p className="text-white text-lg font-medium mb-2">
                {pipelines.length === 0 ? 'No pipelines yet' : 'No matching pipelines'}
              </p>
              <p className="text-am-muted text-sm">
                {pipelines.length === 0
                  ? 'Start a demo pipeline from the dashboard to see results here.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPipelines.map((p) => (
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
                          <span className="text-sm text-am-muted flex items-center gap-1">
                            <Star size={12} /> {p.review_score.toFixed(1)}
                          </span>
                        )}
                        <span className="text-sm text-am-muted flex items-center gap-1">
                          <FileText size={12} /> {p.files_changed}
                        </span>
                        <span className="text-sm text-am-muted flex items-center gap-1">
                          <FlaskConical size={12} /> {p.tests_passed}/{p.tests_total}
                        </span>
                        <StatusBadge status={p.status} />
                        <span className="text-xs text-am-muted flex items-center gap-1">
                          <Clock size={12} />
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
