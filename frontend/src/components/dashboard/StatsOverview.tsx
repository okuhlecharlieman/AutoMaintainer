'use client';

import { PipelineListItem } from '@/types';

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
    { label: 'Total Pipelines', value: total, icon: '🔄', color: '#6366f1' },
    { label: 'Active', value: active, icon: '⚡', color: '#f59e0b' },
    { label: 'Merged', value: merged, icon: '🔀', color: '#10b981' },
    { label: 'Avg. Score', value: avgScore.toFixed(1), icon: '⭐', color: '#ec4899' },
    { label: 'Files Changed', value: totalFiles, icon: '📄', color: '#3b82f6' },
    { label: 'Tests Passed', value: totalTests, icon: '🧪', color: '#10b981' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-am-card rounded-xl border border-am-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{stat.icon}</span>
            <span className="text-xs text-am-muted">{stat.label}</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: stat.color }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
