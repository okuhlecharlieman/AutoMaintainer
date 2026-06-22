'use client';

import { PipelineRun, PipelineStatus, STATUS_CONFIG, AgentRole } from '@/types';
import { getIcon } from '@/lib/icons';
import { Check, X } from 'lucide-react';

interface Props {
  pipeline: PipelineRun;
}

const PIPELINE_STEPS: { status: PipelineStatus; label: string; agent: string; agentRole: AgentRole }[] = [
  { status: 'analyzing', label: 'Analyze', agent: 'Issue Analyst', agentRole: 'issue_analyst' },
  { status: 'planning', label: 'Plan', agent: 'Architect', agentRole: 'architect' },
  { status: 'developing', label: 'Develop', agent: 'Developer', agentRole: 'developer' },
  { status: 'testing', label: 'Test', agent: 'QA Tester', agentRole: 'qa_tester' },
  { status: 'security_scan', label: 'Security', agent: 'Security', agentRole: 'security' },
  { status: 'reviewing', label: 'Review', agent: 'Reviewer', agentRole: 'reviewer' },
  { status: 'documenting', label: 'Document', agent: 'Docs', agentRole: 'documentation' },
  { status: 'awaiting_approval', label: 'Approve', agent: 'Human', agentRole: 'issue_analyst' },
];

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m${remaining}s`;
}

const STATUS_ORDER: PipelineStatus[] = [
  'pending', 'analyzing', 'planning', 'developing', 'testing',
  'security_scan', 'reviewing', 'documenting', 'awaiting_approval',
  'approved', 'merged', 'rejected', 'failed',
];

export default function PipelineTimeline({ pipeline }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(pipeline.status);

  // Determine which step the pipeline actually failed at
  const failedAtIndex = (() => {
    if (pipeline.status !== 'failed') return -1;
    // Use explicit failed_at_status if available
    if (pipeline.failed_at_status) {
      return STATUS_ORDER.indexOf(pipeline.failed_at_status);
    }
    // Fallback: infer from agent_messages (last message = last completed step)
    const agentToStep: Record<string, number> = {
      issue_analyst: 1, architect: 2, developer: 3, qa_tester: 4,
      security: 5, reviewer: 6, documentation: 7,
    };
    let lastStep = 0;
    for (const msg of pipeline.agent_messages || []) {
      const idx = agentToStep[msg.agent_role] ?? 0;
      if (idx > lastStep) lastStep = idx;
    }
    return lastStep;
  })();

  const getStepState = (stepStatus: PipelineStatus) => {
    const stepIndex = STATUS_ORDER.indexOf(stepStatus);
    if (pipeline.status === 'failed') {
      if (stepIndex < failedAtIndex) return 'completed';
      if (stepIndex === failedAtIndex) return 'failed';
      return 'pending';
    }
    if (pipeline.status === 'merged' || pipeline.status === 'approved') return 'completed';
    if (pipeline.status === 'rejected') {
      if (stepIndex < STATUS_ORDER.indexOf('awaiting_approval')) return 'completed';
      return 'rejected';
    }
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  // Build a map of agent_role -> duration_ms from messages
  const durationMap: Record<string, number> = {};
  for (const msg of pipeline.agent_messages || []) {
    const dur = msg.metadata?.duration_ms as number | undefined;
    if (dur != null) {
      durationMap[msg.agent_role] = dur;
    }
  }

  return (
    <div className="bg-am-card rounded-xl border border-am-border p-5">
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {PIPELINE_STEPS.map((step, idx) => {
          const state = getStepState(step.status);
          const config = STATUS_CONFIG[step.status];
          const isLast = idx === PIPELINE_STEPS.length - 1;
          const StepIcon = config ? getIcon(config.icon) : null;
          const stepDuration = durationMap[step.agentRole];

          return (
            <div key={step.status} className="flex items-center shrink-0">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all ${
                    state === 'completed'
                      ? 'bg-am-success/20 border-2 border-am-success'
                      : state === 'active'
                      ? 'bg-am-accent/20 border-2 border-am-accent pipeline-step-active'
                      : state === 'failed'
                      ? 'bg-am-danger/20 border-2 border-am-danger'
                      : state === 'rejected'
                      ? 'bg-am-danger/20 border-2 border-am-danger'
                      : 'bg-am-dark border-2 border-am-border'
                  }`}
                >
                  {state === 'completed' ? (
                    <Check size={16} className="text-am-success" />
                  ) : state === 'active' && StepIcon ? (
                    <StepIcon size={16} style={{ color: config?.color }} />
                  ) : state === 'failed' || state === 'rejected' ? (
                    <X size={16} className="text-am-danger" />
                  ) : (
                    <span className="text-am-muted text-xs">{idx + 1}</span>
                  )}
                </div>
                <span className={`text-[10px] mt-1.5 font-medium text-center ${
                  state === 'active' ? 'text-am-accent' : state === 'completed' ? 'text-am-success' : 'text-am-muted'
                }`}>
                  {step.label}
                </span>
                {stepDuration != null && state === 'completed' && (
                  <span className="text-[9px] text-am-muted/70">{formatStepDuration(stepDuration)}</span>
                )}
              </div>

              {!isLast && (
                <div
                  className={`w-8 h-0.5 mx-1 mt-[-16px] ${
                    state === 'completed' ? 'bg-am-success' : state === 'active' ? 'bg-am-accent' : 'bg-am-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
