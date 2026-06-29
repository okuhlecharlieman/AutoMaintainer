'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/common/Sidebar';
import { api, SystemStatus, LLMModelInfo } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import Link from 'next/link';
import {
  ChevronRight, Settings, Server, Github, Cpu, BarChart3,
  CheckCircle, XCircle, Loader2, RefreshCw, Shield, Clock, Users, Save,
} from 'lucide-react';

const AGENT_ROLES = [
  { key: 'developer', label: 'Developer', description: 'Writes code changes' },
  { key: 'reviewer', label: 'Code Reviewer', description: 'Reviews code quality' },
  { key: 'architect', label: 'Architect', description: 'Designs implementation' },
  { key: 'issue_analyst', label: 'Issue Analyst', description: 'Analyzes issues' },
  { key: 'qa_tester', label: 'QA Tester', description: 'Generates tests' },
  { key: 'security', label: 'Security', description: 'Scans for vulnerabilities' },
  { key: 'documentation', label: 'Documentation', description: 'Writes PR docs' },
];

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [availableModels, setAvailableModels] = useState<LLMModelInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalModels, setOriginalModels] = useState<Record<string, string>>({});
  const [agentTimeouts, setAgentTimeouts] = useState<Record<string, number>>({});
  const [originalTimeouts, setOriginalTimeouts] = useState<Record<string, number>>({});
  const [timeoutLimits, setTimeoutLimits] = useState<{ min: number; max: number }>({ min: 30, max: 900 });
  const [savingTimeouts, setSavingTimeouts] = useState(false);
  const [hasTimeoutChanges, setHasTimeoutChanges] = useState(false);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusData, agentData, timeoutData] = await Promise.all([
        api.getSystemStatus(),
        api.getAgentModels(),
        api.getAgentTimeouts(),
      ]);
      setStatus(statusData);
      setAgentModels(agentData.agent_models);
      setOriginalModels(agentData.agent_models);
      setAvailableModels(agentData.available_models);
      setHasChanges(false);
      setAgentTimeouts(timeoutData.timeouts);
      setOriginalTimeouts(timeoutData.timeouts);
      setTimeoutLimits(timeoutData.limits);
      setHasTimeoutChanges(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleModelChange = (role: string, model: string) => {
    const updated = { ...agentModels, [role]: model };
    setAgentModels(updated);
    setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalModels));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.updateAgentModels(agentModels);
      setAgentModels(result.agent_models);
      setOriginalModels(result.agent_models);
      setAvailableModels(result.available_models);
      setHasChanges(false);
      toast('Agent model assignments saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setAgentModels(originalModels);
    setHasChanges(false);
  };

  const handleTimeoutChange = (role: string, value: number) => {
    const updated = { ...agentTimeouts, [role]: value };
    setAgentTimeouts(updated);
    setHasTimeoutChanges(JSON.stringify(updated) !== JSON.stringify(originalTimeouts));
  };

  const handleSaveTimeouts = async () => {
    setSavingTimeouts(true);
    try {
      const result = await api.updateAgentTimeouts(agentTimeouts);
      setAgentTimeouts(result.timeouts);
      setOriginalTimeouts(result.timeouts);
      setHasTimeoutChanges(false);
      toast('Agent timeouts saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast(msg, 'error');
    } finally {
      setSavingTimeouts(false);
    }
  };

  const handleResetTimeouts = () => {
    setAgentTimeouts(originalTimeouts);
    setHasTimeoutChanges(false);
  };

  const formatTimeout = (seconds: number) => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto pt-8 md:pt-0">
          <nav className="flex items-center gap-1.5 text-sm text-am-muted mb-6">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">Settings</span>
          </nav>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Settings size={28} className="text-am-accent" />
                System Settings
              </h1>
              <p className="text-am-muted mt-1">Backend configuration, LLM models, and agent assignments</p>
            </div>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-4 py-2 bg-am-card border border-am-border rounded-lg text-gray-300 text-sm hover:border-am-accent/30 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {error ? (
            <div className="glass rounded-xl p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <XCircle size={24} className="text-red-400" />
              </div>
              <p className="text-white font-medium mb-2">Backend Unreachable</p>
              <p className="text-am-muted text-sm mb-4">{error}</p>
              <p className="text-am-muted text-xs">
                Start the backend with{' '}
                <code className="text-am-accent bg-am-accent/10 px-2 py-0.5 rounded">
                  cd backend && uvicorn main:app --reload
                </code>
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-am-accent" />
            </div>
          ) : status && (
            <div className="grid gap-6">
              {/* Agent Model Configuration — Full width, top of page */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Cpu size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Agent Model Configuration</h3>
                      <span className="text-xs text-am-muted">Select which LLM powers each agent</span>
                    </div>
                  </div>
                  {hasChanges && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleReset}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 bg-am-accent hover:bg-am-accent/80 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {AGENT_ROLES.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-am-dark rounded-lg border border-am-border/50">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium">{label}</p>
                        <p className="text-xs text-am-muted">{description}</p>
                      </div>
                      <select
                        value={agentModels[key] || ''}
                        onChange={(e) => handleModelChange(key, e.target.value)}
                        className="ml-4 bg-am-darker border border-am-border rounded-lg px-3 py-1.5 text-sm text-white focus:border-am-accent/50 focus:outline-none focus:ring-1 focus:ring-am-accent/30 transition appearance-none cursor-pointer min-w-[180px]"
                      >
                        {availableModels.map((model) => (
                          <option key={model.alias} value={model.alias}>
                            {model.alias} ({model.model})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {availableModels.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-am-border/50">
                    <p className="text-xs text-am-muted mb-2">Available Models ({availableModels.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {availableModels.map((model) => (
                        <span key={model.alias} className="text-xs px-2 py-1 bg-am-darker border border-am-border/50 rounded text-gray-400 font-mono">
                          {model.alias}
                          <span className="text-am-muted ml-1">— {model.model}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Agent Timeout Configuration */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Clock size={20} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Agent Timeout Configuration</h3>
                      <span className="text-xs text-am-muted">
                        Set how long each agent can run before timing out ({timeoutLimits.min}s – {timeoutLimits.max}s)
                      </span>
                    </div>
                  </div>
                  {hasTimeoutChanges && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetTimeouts}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTimeouts}
                        disabled={savingTimeouts}
                        className="px-4 py-1.5 bg-am-accent hover:bg-am-accent/80 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                      >
                        {savingTimeouts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Timeouts
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {AGENT_ROLES.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-am-dark rounded-lg border border-am-border/50">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium">{label}</p>
                        <p className="text-xs text-am-muted">{description}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <input
                          type="range"
                          min={timeoutLimits.min}
                          max={timeoutLimits.max}
                          step={30}
                          value={agentTimeouts[key] || 120}
                          onChange={(e) => handleTimeoutChange(key, parseInt(e.target.value))}
                          className="w-32 accent-am-accent"
                        />
                        <span className="text-sm text-amber-400 font-mono min-w-[60px] text-right">
                          {formatTimeout(agentTimeouts[key] || 120)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Backend Status */}
                <div className="bg-am-card rounded-xl border border-am-border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-am-accent/10 flex items-center justify-center">
                      <Server size={20} className="text-am-accent" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Backend Server</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-am-success animate-pulse" />
                        <span className="text-xs text-am-success">Online</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-2">
                        <Shield size={14} /> Auth
                      </span>
                      <span className={status.backend.auth_enabled ? 'text-am-success' : 'text-amber-400'}>
                        {status.backend.auth_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-2">
                        <BarChart3 size={14} /> Max Concurrent
                      </span>
                      <span className="text-white">{status.backend.max_concurrent_pipelines}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-2">
                        <Clock size={14} /> Pipeline Timeout
                      </span>
                      <span className="text-white">{status.backend.pipeline_timeout_seconds}s</span>
                    </div>
                  </div>
                </div>

                {/* GitHub Integration */}
                <div className="bg-am-card rounded-xl border border-am-border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center">
                      <Github size={20} className="text-gray-300" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">GitHub Integration</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {status.github.configured ? (
                          <>
                            <CheckCircle size={12} className="text-am-success" />
                            <span className="text-xs text-am-success">Token configured</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={12} className="text-amber-400" />
                            <span className="text-xs text-amber-400">No token set</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">
                    {status.github.configured
                      ? 'GitHub token is configured. Pipelines can fetch repos, create branches, and open PRs.'
                      : 'Set GITHUB_TOKEN in your .env to enable repo access and PR creation. Demo pipelines still work without it.'
                    }
                  </p>
                </div>

                {/* LLM Models */}
                <div className="bg-am-card rounded-xl border border-am-border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <Cpu size={20} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Registered Models</h3>
                      <span className="text-xs text-am-muted">
                        Default: <span className="text-purple-400">{status.llm.default_model}</span>
                      </span>
                    </div>
                  </div>
                  {status.llm.models.length > 0 ? (
                    <div className="space-y-2">
                      {status.llm.models.map((model) => (
                        <div key={model.alias} className="flex items-center justify-between p-2.5 bg-am-dark rounded-lg border border-am-border/50">
                          <div>
                            <span className="text-sm text-white font-mono">{model.alias}</span>
                            <span className="text-xs text-am-muted ml-2">{model.model}</span>
                          </div>
                          {model.is_default && (
                            <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded font-medium">default</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">
                      No LLM models configured. Set DASHSCOPE_API_KEY or LLM_MODELS in your .env file.
                    </p>
                  )}
                </div>

                {/* Pipeline Stats */}
                <div className="bg-am-card rounded-xl border border-am-border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <BarChart3 size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Pipeline Overview</h3>
                      <span className="text-xs text-am-muted">Current system load</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-am-dark rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{status.pipelines.total}</p>
                      <p className="text-xs text-am-muted">Total</p>
                    </div>
                    <div className="bg-am-dark rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-am-accent">{status.pipelines.active}</p>
                      <p className="text-xs text-am-muted">Active</p>
                    </div>
                    <div className="bg-am-dark rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-400">{status.pipelines.running_tasks}</p>
                      <p className="text-xs text-am-muted">Running</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
