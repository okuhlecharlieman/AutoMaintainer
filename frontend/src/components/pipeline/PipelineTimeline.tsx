'use client';

import { PipelineRun, PipelineStatus, STATUS_CONFIG } from '@/types';

interface Props {
  pipeline: PipelineRun;
}

const PIPELINE_STEPS: { status: PipelineStatus; label: string; agent: string }[] = [
  { status: 'analyzing', label: 'Analyze', agent: 'Issue Analyst' },
  { status: 'planning', label: 'Plan', agent: 'Architect' },
  { status: 'developing', label: 'Develop', agent: 'Developer' },
  { status: 'testing', label: 'Test', agent: 'QA Tester' },
  { status: 'security_scan', label: 'Security', agent: 'Security' },
  { status: 'reviewing', label: 'Review', agent: 'Reviewer' },
  { status: 'documenting', label: 'Document', agent: 'Docs' },
  { status: 'awaiting_approval', label: 'Approve', agent: 'Human' },
];

const STATUS_ORDER: PipelineStatus[] = [
  'pending', 'analyzing', 'planning', 'developing', 'testing',
  'security_scan', 'reviewing', 'documenting', 'awaiting_approval',
  'approved', 'merged', 'rejected', 'failed',
];

export default function PipelineTimeline({ pipeline }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(pipeline.status);

  const getStepState = (stepStatus: PipelineStatus) => {
    const stepIndex = STATUS_ORDER.indexOf(stepStatus);
    if (pipeline.status === 'failed') {
      if (stepIndex < currentIndex) return 'completed';
      if (stepIndex === currentIndex) return 'failed';
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

  return (
    <div className="bg-am-card rounded-xl border border-am-border p-5">
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {PIPELINE_STEPS.map((step, idx) => {
          const state = getStepState(step.status);
          const config = STATUS_CONFIG[step.status];
          const isLast = idx === PIPELINE_STEPS.length - 1;

          return (
            <div key={step.status} className="flex items-center shrink-0">
              <div className="flex flex-col items-center">
                {/* Step circle */}
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
                  {state === 'completed' ? '✓' : state === 'active' ? config?.icon : state === 'failed' ? '✗' : state === 'rejected' ? '✗' : (idx + 1)}
                </div>
                {/* Label */}
                <span className={`text-[10px] mt-1.5 font-medium text-center ${
                  state === 'active' ? 'text-am-accent' : state === 'completed' ? 'text-am-success' : 'text-am-muted'
                }`}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
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
