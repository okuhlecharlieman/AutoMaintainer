'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import { Rocket, Settings, Loader2, X, ExternalLink, Link as LinkIcon, CheckCircle } from 'lucide-react';

interface Props {
  onPipelineStarted: () => void;
}

function parseGitHubIssueUrl(url: string): { repo_url: string; issue_number: number } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (match) {
    return { repo_url: `https://github.com/${match[1]}`, issue_number: parseInt(match[2], 10) };
  }
  return null;
}

export default function QuickStartPanel({ onPipelineStarted }: Props) {
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const { toast } = useToast();
  const [issueUrlInput, setIssueUrlInput] = useState('');
  const [parsedUrl, setParsedUrl] = useState<{ repo_url: string; issue_number: number } | null>(null);
  const [formData, setFormData] = useState({
    repo_url: '',
    issue_number: 1,
    issue_title: '',
    issue_body: '',
  });

  const handleIssueUrlChange = (value: string) => {
    setIssueUrlInput(value);
    const parsed = parseGitHubIssueUrl(value);
    if (parsed) {
      setParsedUrl(parsed);
      setFormData((prev) => ({
        ...prev,
        repo_url: parsed.repo_url,
        issue_number: parsed.issue_number,
      }));
    } else {
      setParsedUrl(null);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      await api.startDemoPipeline();
      toast('Demo pipeline started successfully!', 'success');
      onPipelineStarted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast(`Failed to start demo: ${msg}`, 'error');
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
      toast('Pipeline started successfully!', 'success');
      setShowCustom(false);
      onPipelineStarted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast(`Failed to start pipeline: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleDemo}
        disabled={loading}
        className="px-5 py-2.5 bg-gradient-to-r from-am-accent to-purple-600 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-am-accent/20 hover:shadow-am-accent/30"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Starting...
          </>
        ) : (
          <>
            <Rocket size={16} /> Run Demo Pipeline
          </>
        )}
      </button>
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="px-4 py-2.5 bg-am-card border border-am-border text-gray-300 rounded-lg font-medium text-sm hover:border-am-accent/30 transition-all flex items-center gap-2"
      >
        <Settings size={16} />
        Custom Issue
      </button>

      {showCustom && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-am-card border border-am-border rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-am-accent/10 flex items-center justify-center">
                  <ExternalLink size={20} className="text-am-accent" />
                </div>
                <div>
                  <h3 className="text-white text-lg font-semibold">Process GitHub Issue</h3>
                  <p className="text-am-muted text-xs mt-0.5">Paste a GitHub issue URL or fill in manually</p>
                </div>
              </div>
              <button onClick={() => setShowCustom(false)} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                <X size={18} />
              </button>
            </div>

            {/* Quick URL paste */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
                <LinkIcon size={12} /> Paste Issue URL (auto-fills fields)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="https://github.com/owner/repo/issues/42"
                  value={issueUrlInput}
                  onChange={(e) => handleIssueUrlChange(e.target.value)}
                  className={`w-full px-4 py-2.5 bg-am-dark border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none transition-colors ${
                    parsedUrl ? 'border-am-success/50 focus:border-am-success' : 'border-am-border focus:border-am-accent'
                  }`}
                />
                {parsedUrl && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle size={16} className="text-am-success" />
                  </div>
                )}
              </div>
              {parsedUrl && (
                <p className="text-xs text-am-success mt-1">
                  Parsed: {parsedUrl.repo_url} &rarr; Issue #{parsedUrl.issue_number}
                </p>
              )}
            </div>

            <div className="h-px bg-am-border mb-4" />

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Repository URL</label>
                <input
                  type="text"
                  placeholder="https://github.com/owner/repo"
                  value={formData.repo_url}
                  onChange={(e) => setFormData({ ...formData, repo_url: e.target.value })}
                  className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Issue Number</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={formData.issue_number}
                    onChange={(e) => setFormData({ ...formData, issue_number: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Issue Title</label>
                  <input
                    type="text"
                    placeholder="Fix login bug"
                    value={formData.issue_title}
                    onChange={(e) => setFormData({ ...formData, issue_title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Issue Description</label>
                <textarea
                  placeholder="Describe the issue..."
                  value={formData.issue_body}
                  onChange={(e) => setFormData({ ...formData, issue_body: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent resize-none transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCustom}
                disabled={loading || !formData.repo_url}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-am-accent to-purple-600 text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                Start Pipeline
              </button>
              <button
                onClick={() => setShowCustom(false)}
                className="px-4 py-2.5 bg-am-dark border border-am-border text-gray-300 rounded-lg text-sm hover:bg-white/5 transition-colors"
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
