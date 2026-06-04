'use client';

import { AGENT_CONFIG, AgentRole, PipelineListItem } from '@/types';

interface Props {
  pipelines: PipelineListItem[];
}

export default function AgentStatusGrid({ pipelines }: Props) {
  const activePipelines = pipelines.filter((p) =>
    !['merged', 'rejected', 'failed'].includes(p.status)
  );

  const agents = Object.entries(AGENT_CONFIG) as [AgentRole, typeof AGENT_CONFIG[AgentRole]][];

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-4">Agent Team</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {agents.map(([role, config]) => {
          const isActive = activePipelines.length > 0;
          return (
            <div
              key={role}
              className={`bg-am-card rounded-xl border border-am-border p-4 text-center transition-all hover:border-opacity-50 ${
                isActive ? 'animate-pulse-slow' : ''
              }`}
              style={{ borderColor: isActive ? `${config.color}40` : undefined }}
            >
              <div className="text-2xl mb-2">{config.icon}</div>
              <div className="text-xs font-medium text-white truncate">{config.name}</div>
              <div
                className="text-[10px] mt-1 font-medium"
                style={{ color: isActive ? config.color : '#6b7280' }}
              >
                {isActive ? 'Active' : 'Idle'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
