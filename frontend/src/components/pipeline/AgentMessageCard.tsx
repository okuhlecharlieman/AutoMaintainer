'use client';

import { useState } from 'react';
import { AgentMessage, AGENT_CONFIG } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  message: AgentMessage;
}

export default function AgentMessageCard({ message }: Props) {
  const [showThinking, setShowThinking] = useState(false);
  const config = AGENT_CONFIG[message.agent_role];

  return (
    <div className="bg-am-card rounded-xl border border-am-border p-5 animate-slide-in" style={{ borderLeftColor: config?.color, borderLeftWidth: '3px' }}>
      <div className="flex items-start gap-4">
        {/* Agent Avatar */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: `${config?.color}20` }}
        >
          {config?.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white font-medium text-sm">{config?.name}</span>
            <span className="text-am-muted text-xs">
              {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
            </span>
          </div>

          <div className="markdown-content text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>

          {/* Thinking toggle */}
          {message.thinking && (
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="mt-3 text-xs text-am-accent hover:text-am-accent-light transition-colors flex items-center gap-1"
            >
              <span>{showThinking ? '▼' : '▶'}</span>
              View reasoning
            </button>
          )}

          {showThinking && message.thinking && (
            <div className="mt-2 p-3 bg-am-dark rounded-lg border border-am-border">
              <p className="text-xs text-am-muted font-medium mb-1">🧠 Reasoning Chain</p>
              <p className="text-xs text-gray-400 leading-relaxed">{message.thinking}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
