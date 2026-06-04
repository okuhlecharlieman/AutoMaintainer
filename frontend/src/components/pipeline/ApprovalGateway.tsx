'use client';

import { useState } from 'react';
import { PipelineRun } from '@/types';
import { api } from '@/lib/api';

interface Props {
  pipeline: PipelineRun;
  onAction: () => void;
}

export default function ApprovalGateway({ pipeline, onAction }: Props) {
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await api.approvePipeline(pipeline.id);
      onAction();
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.rejectPipeline(pipeline.id, rejectReason);
      onAction();
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/10 border border-amber-500/30 rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl shrink-0">
          ⏸️
        </div>
        <div className="flex-1">
          <h3 className="text-white font-semibold text-lg">Human Approval Required</h3>
          <p className="text-amber-200/70 text-sm mt-1">
            The AI team has completed their work. Review the changes before merging.
          </p>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-am-dark/50 rounded-lg p-3">
              <p className="text-xs text-am-muted">Files Changed</p>
              <p className="text-white font-bold text-lg">{pipeline.code_changes.length}</p>
            </div>
            <div className="bg-am-dark/50 rounded-lg p-3">
              <p className="text-xs text-am-muted">Tests Passed</p>
              <p className="text-white font-bold text-lg">
                {pipeline.test_results.filter(t => t.passed).length}/{pipeline.test_results.length}
              </p>
            </div>
            <div className="bg-am-dark/50 rounded-lg p-3">
              <p className="text-xs text-am-muted">Review Score</p>
              <p className="text-white font-bold text-lg">
                {pipeline.review_score?.overall.toFixed(1) || 'N/A'}/10
              </p>
            </div>
          </div>

          {/* Risk indicators */}
          {pipeline.security_findings.length > 0 && (
            <div className="mt-3 p-3 bg-red-900/20 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs font-medium">
                ⚠️ {pipeline.security_findings.length} security finding(s) detected
              </p>
            </div>
          )}

          {/* PR Title */}
          {pipeline.pr_title && (
            <div className="mt-3 p-3 bg-am-dark/50 rounded-lg">
              <p className="text-xs text-am-muted">Proposed PR Title</p>
              <p className="text-white text-sm font-mono mt-1">{pipeline.pr_title}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="px-6 py-2.5 bg-am-success text-white rounded-lg font-medium text-sm hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              ✅ Approve & Merge
            </button>
            <button
              onClick={() => setShowReject(!showReject)}
              className="px-5 py-2.5 bg-am-dark border border-red-500/30 text-red-400 rounded-lg font-medium text-sm hover:bg-red-900/20 transition-colors"
            >
              ❌ Reject
            </button>
          </div>

          {showReject && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 px-4 py-2 bg-am-dark border border-am-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
              />
              <button
                onClick={handleReject}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
