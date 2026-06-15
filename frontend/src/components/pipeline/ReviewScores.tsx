'use client';

import { ReviewScore, SecurityFinding } from '@/types';
import { Eye, MessageSquare, Lightbulb, Shield } from 'lucide-react';

interface Props {
  score?: ReviewScore;
  findings: SecurityFinding[];
}

export default function ReviewScores({ score, findings }: Props) {
  if (!score) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mx-auto mb-3">
          <Eye size={24} className="text-pink-400" />
        </div>
        <p className="text-white font-medium">Review pending</p>
        <p className="text-am-muted text-sm mt-1">Scores will appear after the Reviewer agent completes</p>
      </div>
    );
  }

  const dimensions = [
    { label: 'Readability', value: score.readability, color: '#6366f1' },
    { label: 'Maintainability', value: score.maintainability, color: '#10b981' },
    { label: 'Security', value: score.security, color: '#ef4444' },
    { label: 'Performance', value: score.performance, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-am-card rounded-xl border border-am-border p-6 flex items-center gap-8">
        <div className="text-center">
          <div className="text-5xl font-bold" style={{
            color: score.overall >= 8 ? '#10b981' : score.overall >= 6 ? '#f59e0b' : '#ef4444'
          }}>
            {score.overall.toFixed(1)}
          </div>
          <p className="text-am-muted text-sm mt-1">Overall Score</p>
        </div>
        <div className="flex-1 grid grid-cols-4 gap-4">
          {dimensions.map((dim) => (
            <div key={dim.label} className="text-center">
              <div className="text-2xl font-bold" style={{ color: dim.color }}>
                {dim.value.toFixed(1)}
              </div>
              <p className="text-am-muted text-xs mt-1">{dim.label}</p>
              <div className="mt-2 h-1.5 bg-am-dark rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${dim.value * 10}%`, backgroundColor: dim.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {score.comments.length > 0 && (
        <div className="bg-am-card rounded-xl border border-am-border p-5">
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <MessageSquare size={14} className="text-am-accent" /> Review Comments
          </h3>
          <div className="space-y-2">
            {score.comments.map((comment, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-am-muted mt-0.5">&#8226;</span>
                <span>{comment}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {score.suggestions.length > 0 && (
        <div className="bg-am-card rounded-xl border border-am-border p-5">
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-400" /> Suggestions
          </h3>
          <div className="space-y-2">
            {score.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-am-accent mt-0.5">&rarr;</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {findings.length > 0 && (
        <div className="bg-am-card rounded-xl border border-red-500/20 p-5">
          <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
            <Shield size={14} className="text-red-400" /> Security Findings ({findings.length})
          </h3>
          <div className="space-y-3">
            {findings.map((finding, i) => (
              <div key={i} className="p-3 bg-am-dark rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    finding.severity === 'critical' ? 'bg-red-900/40 text-red-400' :
                    finding.severity === 'high' ? 'bg-orange-900/40 text-orange-400' :
                    finding.severity === 'medium' ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-blue-900/40 text-blue-400'
                  }`}>
                    {finding.severity}
                  </span>
                  <span className="text-xs text-am-muted">{finding.category}</span>
                </div>
                <p className="text-sm text-gray-300">{finding.description}</p>
                <p className="text-xs text-am-accent mt-1 flex items-center gap-1">
                  <Lightbulb size={10} /> {finding.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
