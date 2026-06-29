'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import { Rocket, Settings, Loader2, X, ExternalLink, Link as LinkIcon, CheckCircle, Github, MessageSquare } from 'lucide-react';

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
  const [repos, setRepos] = useState<{ name: string; full_name: string; url: string; description: string; private: boolean }[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [formData, setFormData] = useState({
    repo_url: '',
    issue_number: 1,
    issue_title: '',
    issue_body: '',
    custom_instructions: '',
  });

  useEffect(() => {
    if (showCustom) {
      setReposLoading(true);
      api.listUserRepos()
        .then((data) => setRepos(data.repos))
        .catch(() => setRepos([]))
        .finally(() => setReposLoading(false));
    }
  }, [showCustom]);

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

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.repo_url.trim()) errors.repo_url = 'Repository URL is required';
    else if (!/^https?:\/\/github\.com\/.+\/.+/.test(formData.repo_url.trim())) errors.repo_url = 'Must be a valid GitHub repo URL';
    if (!formData.issue_number || formData.issue_number < 1) errors.issue_number = 'Issue number is required';
    if (!formData.issue_title.trim()) errors.issue_title = 'Issue title is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCustom = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      await api.startPipeline({
        repo_url: formData.repo_url.trim(),
        issue_url: `${formData.repo_url.trim()}/issues/${formData.issue_number}`,
        issue_number: formData.issue_number,
        issue_title: formData.issue_title.trim(),
        issue_body: formData.issue_body,
        custom_instructions: formData.custom_instructions,
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
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
                  <Github size={12} /> Repository <span className="text-red-400">*</span>
                </label>
                {reposLoading ? (
                  <div className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-am-muted text-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Loading repos...
                  </div>
                ) : repos.length > 0 ? (
                  <select
                    value={formData.repo_url}
                    onChange={(e) => { setFormData({ ...formData, repo_url: e.target.value }); setValidationErrors((prev) => { const n = {...prev}; delete n.repo_url; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-am-dark border rounded-lg text-white text-sm focus:outline-none transition-colors appearance-none cursor-pointer ${validationErrors.repo_url ? 'border-red-500/50 focus:border-red-500' : 'border-am-border focus:border-am-accent'}`}
                  >
                    <option value="">Select a repository...</option>
                    {repos.map((repo) => (
                      <option key={repo.url} value={repo.url}>
                        {repo.full_name} {repo.private ? '(private)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={formData.repo_url}
                    onChange={(e) => { setFormData({ ...formData, repo_url: e.target.value }); setValidationErrors((prev) => { const n = {...prev}; delete n.repo_url; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-am-dark border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none transition-colors ${validationErrors.repo_url ? 'border-red-500/50 focus:border-red-500' : 'border-am-border focus:border-am-accent'}`}
                  />
                )}
                {validationErrors.repo_url && <p className="text-red-400 text-xs mt-1">{validationErrors.repo_url}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Issue Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="1"
                    min={1}
                    value={formData.issue_number}
                    onChange={(e) => { setFormData({ ...formData, issue_number: parseInt(e.target.value) || 1 }); setValidationErrors((prev) => { const n = {...prev}; delete n.issue_number; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-am-dark border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none transition-colors ${validationErrors.issue_number ? 'border-red-500/50 focus:border-red-500' : 'border-am-border focus:border-am-accent'}`}
                  />
                  {validationErrors.issue_number && <p className="text-red-400 text-xs mt-1">{validationErrors.issue_number}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Issue Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Fix login bug"
                    value={formData.issue_title}
                    onChange={(e) => { setFormData({ ...formData, issue_title: e.target.value }); setValidationErrors((prev) => { const n = {...prev}; delete n.issue_title; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-am-dark border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none transition-colors ${validationErrors.issue_title ? 'border-red-500/50 focus:border-red-500' : 'border-am-border focus:border-am-accent'}`}
                  />
                  {validationErrors.issue_title && <p className="text-red-400 text-xs mt-1">{validationErrors.issue_title}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Issue Description <span className="text-am-muted">(optional)</span></label>
                <textarea
                  placeholder="Describe the issue..."
                  value={formData.issue_body}
                  onChange={(e) => setFormData({ ...formData, issue_body: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent resize-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Custom Instructions <span className="text-am-muted">(optional)</span>
                </label>
                <textarea
                  placeholder="e.g. Use React instead of vanilla JS, focus on mobile responsive, keep changes minimal..."
                  value={formData.custom_instructions}
                  onChange={(e) => setFormData({ ...formData, custom_instructions: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent resize-none transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCustom}
                disabled={loading}
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
