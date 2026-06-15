'use client';

import { PipelineStatus, STATUS_CONFIG } from '@/types';
import { getIcon } from '@/lib/icons';

interface StatusBadgeProps {
  status: PipelineStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const Icon = getIcon(config.icon);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      {config.label}
    </span>
  );
}
