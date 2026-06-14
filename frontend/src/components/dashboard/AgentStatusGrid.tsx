'use client';

import { AGENT_CONFIG, AgentRole, PipelineListItem } from '@/types';
import { Search, Landmark, Code, FlaskConical, Shield, FileText, Eye } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

const AGENT_ICONS: Record<AgentRole, LucideIcon> = {
  issue_analyst: Search,
  architect: Landmark,
  developer: Code,
  qa_tester: FlaskConical,
  security: Shield,
  documentation: FileText,
  reviewer: Eye,
};

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
          const Icon = AGENT_ICONS[role];
          return (
            <div
              key={role}
              className={`bg-am-card rounded-xl border border-am-border p-4 text-center transition-all hover:border-opacity-50 group ${
                isActive ? 'agent-glow' : ''
              }`}
              style={{ borderColor: isActive ? `${config.color}40` : undefined }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <Icon size={20} style={{ color: config.color }} />
              </div>
              <div className="text-xs font-medium text-white truncate">{config.name}</div>
              <div
                className="text-[10px] mt-1 font-medium flex items-center justify-center gap-1"
                style={{ color: isActive ? config.color : '#6b7280' }}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: config.color }} />}
                {isActive ? 'Active' : 'Idle'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
