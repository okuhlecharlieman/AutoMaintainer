'use client';

import { useState } from 'react';
import { AgentMessage, AGENT_CONFIG } from '@/types';
import { getIcon } from '@/lib/icons';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronRight, Brain, Clock } from 'lucide-react';

interface Props {
  message: AgentMessage;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

export default function AgentMessageCard({ message }: Props) {
  const [showThinking, setShowThinking] = useState(false);
  const config = AGENT_CONFIG[message.agent_role];
  const Icon = getIcon(config?.icon || 'Clock');
  const durationMs = message.metadata?.duration_ms as number | undefined;

  return (
    <div className="bg-am-card rounded-xl border border-am-border p-5 animate-slide-in" style={{ borderLeftColor: config?.color, borderLeftWidth: '3px' }}>
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${config?.color}20` }}
        >
          <Icon size={20} style={{ color: config?.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white font-medium text-sm">{config?.name}</span>
            <span className="text-am-muted text-xs">
              {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
            </span>
            {durationMs != null && (
              <span className="text-am-muted text-xs flex items-center gap-1 ml-auto">
                <Clock size={12} />
                {formatDuration(durationMs)}
              </span>
            )}
          </div>

          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>

          {message.thinking && (
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="mt-3 text-xs text-am-accent hover:text-am-accent-light transition-colors flex items-center gap-1"
            >
              {showThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              View reasoning
            </button>
          )}

          {showThinking && message.thinking && (
            <div className="mt-2 p-3 bg-am-dark rounded-lg border border-am-border">
              <p className="text-xs text-am-muted font-medium mb-1 flex items-center gap-1.5">
                <Brain size={12} /> Reasoning Chain
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">{message.thinking}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
