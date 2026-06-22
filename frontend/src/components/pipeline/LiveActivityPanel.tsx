'use client';

import { useEffect, useState, useRef } from 'react';
import { PipelineStatus, AGENT_CONFIG, STATUS_CONFIG } from '@/types';
import { api } from '@/lib/api';
import { Activity, Zap, Clock } from 'lucide-react';

interface LiveEvent {
  id: string;
  event_type: string;
  agent_role?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface Props {
  pipelineId: string;
  status: PipelineStatus;
}

function formatElapsed(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
}

export default function LiveActivityPanel({ pipelineId, status }: Props) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [stageStartTime, setStageStartTime] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState('0s');
  const eventSourceRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const url = api.getPipelineEventsUrl(pipelineId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.event_type === 'heartbeat') return;

        if (data.event_type === 'agent_start') {
          setCurrentAgent(data.agent_role);
          setCurrentPhase(data.data?.phase || null);
          setStageStartTime(Date.now());
        } else if (data.event_type === 'agent_complete') {
          setCurrentAgent(null);
          setCurrentPhase(null);
        } else if (data.event_type === 'pipeline_failed' || data.event_type === 'awaiting_approval') {
          setCurrentAgent(null);
          setCurrentPhase(null);
        }

        setEvents((prev) => [...prev.slice(-20), { ...data, id: `${Date.now()}-${Math.random()}` }]);
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [pipelineId]);

  // Elapsed time ticker
  useEffect(() => {
    if (currentAgent) {
      intervalRef.current = setInterval(() => {
        setElapsed(formatElapsed(stageStartTime));
      }, 1000);
    } else {
      setElapsed('0s');
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentAgent, stageStartTime]);

  const statusConfig = STATUS_CONFIG[status];
  const agentConfig = currentAgent ? AGENT_CONFIG[currentAgent as keyof typeof AGENT_CONFIG] : null;

  return (
    <div className="bg-am-card rounded-xl border border-am-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-am-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity size={16} className="text-am-accent" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <span className="text-white text-sm font-medium">Live Activity</span>
          {connected && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Connected</span>
          )}
        </div>
        {currentAgent && (
          <div className="flex items-center gap-2 text-xs text-am-muted">
            <Clock size={12} />
            <span>{elapsed}</span>
          </div>
        )}
      </div>

      {/* Current activity */}
      <div className="px-4 py-3">
        {currentAgent && agentConfig ? (
          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${agentConfig.color}20` }}
              >
                <Zap size={16} style={{ color: agentConfig.color }} className="animate-pulse" />
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-medium">
                {agentConfig.name} is working...
              </p>
              <p className="text-am-muted text-xs">
                {currentPhase ? currentPhase.replace(/_/g, ' ') : 'Processing'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-am-accent/10 flex items-center justify-center">
              <Activity size={16} className="text-am-accent animate-spin" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">
                {statusConfig?.label || 'Processing'}
              </p>
              <p className="text-am-muted text-xs">Pipeline is running</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent events log */}
      {events.length > 0 && (
        <div className="px-4 pb-3">
          <div className="max-h-32 overflow-y-auto space-y-1 border-t border-am-border/50 pt-2">
            {events.slice(-5).map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-am-accent/50 shrink-0" />
                <span className="truncate">
                  {ev.event_type === 'agent_start' && `${AGENT_CONFIG[ev.agent_role as keyof typeof AGENT_CONFIG]?.name || ev.agent_role} started`}
                  {ev.event_type === 'agent_complete' && `${AGENT_CONFIG[ev.agent_role as keyof typeof AGENT_CONFIG]?.name || ev.agent_role} complete${ev.data?.duration_ms ? ` (${Math.round((ev.data.duration_ms as number) / 1000)}s)` : ''}`}
                  {ev.event_type === 'phase_start' && `Gathering context...`}
                  {ev.event_type === 'pipeline_started' && `Pipeline started`}
                  {ev.event_type === 'pipeline_failed' && `Pipeline failed`}
                  {ev.event_type === 'awaiting_approval' && `Ready for approval`}
                  {!['agent_start', 'agent_complete', 'phase_start', 'pipeline_started', 'pipeline_failed', 'awaiting_approval'].includes(ev.event_type) && ev.event_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
