'use client';

import { PipelineListItem } from '@/types';
import { RefreshCw, Zap, GitMerge, Star, FileText, FlaskConical } from 'lucide-react';

interface Props {
  pipelines: PipelineListItem[];
}

export default function StatsOverview({ pipelines }: Props) {
  const total = pipelines.length;
  const merged = pipelines.filter((p) => p.status === 'merged').length;
  const active = pipelines.filter((p) => !['merged', 'rejected', 'failed'].includes(p.status)).length;
  const avgScore = pipelines.reduce((acc, p) => acc + (p.review_score || 0), 0) / (total || 1);
  const totalFiles = pipelines.reduce((acc, p) => acc + p.files_changed, 0);
  const totalTests = pipelines.reduce((acc, p) => acc + p.tests_passed, 0);

  const stats = [
    { label: 'Total Pipelines', value: total, icon: RefreshCw, color: '#6366f1' },
    { label: 'Active', value: active, icon: Zap, color: '#f59e0b' },
    { label: 'Merged', value: merged, icon: GitMerge, color: '#10b981' },
    { label: 'Avg. Score', value: avgScore.toFixed(1), icon: Star, color: '#ec4899' },
    { label: 'Files Changed', value: totalFiles, icon: FileText, color: '#3b82f6' },
    { label: 'Tests Passed', value: totalTests, icon: FlaskConical, color: '#10b981' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="bg-am-card rounded-xl border border-am-border p-4 hover:border-opacity-60 transition-all group" style={{ borderColor: `${stat.color}15` }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}15` }}>
                <Icon size={14} style={{ color: stat.color }} />
              </div>
              <span className="text-xs text-am-muted">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
