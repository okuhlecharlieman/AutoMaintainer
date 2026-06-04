'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  onPipelineStarted: () => void;
}

export default function QuickStartPanel({ onPipelineStarted }: Props) {
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [formData, setFormData] = useState({
    repo_url: '',
    issue_number: 1,
    issue_title: '',
    issue_body: '',
  });

  const handleDemo = async () => {
    setLoading(true);
    try {
      await api.startDemoPipeline();
      onPipelineStarted();
    } catch (err) {
      console.error('Failed to start demo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustom = async () => {
    setLoading(true);
    try {
      await api.startPipeline({
        repo_url: formData.repo_url,
        issue_url: `${formData.repo_url}/issues/${formData.issue_number}`,
        issue_number: formData.issue_number,
        issue_title: formData.issue_title,
        issue_body: formData.issue_body,
      });
      onPipelineStarted();
    } catch (err) {
      console.error('Failed to start pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleDemo}
        disabled={loading}
        className="px-5 py-2.5 bg-gradient-to-r from-am-accent to-purple-600 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span> Starting...
          </>
        ) : (
          <>🚀 Run Demo Pipeline</>
        )}
      </button>
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="px-4 py-2.5 bg-am-card border border-am-border text-gray-300 rounded-lg font-medium text-sm hover:border-am-accent/30 transition-all"
      >
        Custom Issue
      </button>

      {showCustom && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-am-card border border-am-border rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white text-lg font-semibold mb-4">Process GitHub Issue</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Repository URL (https://github.com/owner/repo)"
                value={formData.repo_url}
                onChange={(e) => setFormData({ ...formData, repo_url: e.target.value })}
                className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent"
              />
              <input
                type="number"
                placeholder="Issue number"
                value={formData.issue_number}
                onChange={(e) => setFormData({ ...formData, issue_number: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent"
              />
              <input
                type="text"
                placeholder="Issue title"
                value={formData.issue_title}
                onChange={(e) => setFormData({ ...formData, issue_title: e.target.value })}
                className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent"
              />
              <textarea
                placeholder="Issue description"
                value={formData.issue_body}
                onChange={(e) => setFormData({ ...formData, issue_body: e.target.value })}
                rows={4}
                className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent resize-none"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCustom}
                disabled={loading || !formData.repo_url}
                className="flex-1 px-4 py-2.5 bg-am-accent text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
              >
                Start Pipeline
              </button>
              <button
                onClick={() => setShowCustom(false)}
                className="px-4 py-2.5 bg-am-dark border border-am-border text-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
