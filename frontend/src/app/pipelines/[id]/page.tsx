'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/common/Sidebar';
import StatusBadge from '@/components/common/StatusBadge';
import AgentMessageCard from '@/components/pipeline/AgentMessageCard';
import PipelineTimeline from '@/components/pipeline/PipelineTimeline';
import CodeDiffView from '@/components/pipeline/CodeDiffView';
import ApprovalGateway from '@/components/pipeline/ApprovalGateway';
import ReviewScores from '@/components/pipeline/ReviewScores';
import TestResultsPanel from '@/components/pipeline/TestResultsPanel';
import LiveActivityPanel from '@/components/pipeline/LiveActivityPanel';
import { api } from '@/lib/api';
import { PipelineRun } from '@/types';
import { useToast } from '@/components/common/Toast';
import { ChevronRight, ExternalLink, Loader2, ClipboardList, Code, FlaskConical, Eye, Trash2, RotateCcw, Square, MessageSquare } from 'lucide-react';

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = params.id as string;
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'code' | 'tests' | 'review'>('timeline');
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRetryPrompt, setShowRetryPrompt] = useState(false);
  const [retryInstructions, setRetryInstructions] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        const data = await api.getPipeline(pipelineId);
        setPipeline(data);
      } catch (err) {
        console.error('Failed to fetch pipeline:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPipeline();
    const interval = setInterval(fetchPipeline, 3000);
    return () => clearInterval(interval);
  }, [pipelineId]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || window.pageYOffset;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      setIsScrolledToBottom(scrollTop + windowHeight >= documentHeight - 100);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (activeTab !== 'timeline' || !isScrolledToBottom) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pipeline?.agent_messages, activeTab, isScrolledToBottom]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-am-accent mx-auto mb-4" />
            <p className="text-am-muted">Loading pipeline...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-am-muted">Pipeline not found</p>
        </main>
      </div>
    );
  }

  const tabs = [
    { id: 'timeline' as const, label: 'Agent Timeline', icon: ClipboardList },
    { id: 'code' as const, label: 'Code Changes', icon: Code },
    { id: 'tests' as const, label: 'Test Results', icon: FlaskConical },
    { id: 'review' as const, label: 'Review', icon: Eye },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6 pt-8 md:pt-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-am-muted">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <Link href="/pipelines" className="hover:text-white transition-colors">Pipelines</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium truncate max-w-[200px]">#{pipeline.issue_number}</span>
          </nav>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">
                  #{pipeline.issue_number} {pipeline.issue_title}
                </h1>
                <StatusBadge status={pipeline.status} size="md" />
              </div>
              <p className="text-am-muted text-sm">{pipeline.repo_url}</p>
              {pipeline.pr_url && (
                <a href={pipeline.pr_url} target="_blank" rel="noopener noreferrer" className="text-am-accent text-sm hover:text-am-accent-light mt-1 inline-flex items-center gap-1.5 transition-colors">
                  <ExternalLink size={14} />
                  View Pull Request
                </a>
              )}
              {pipeline.custom_instructions && (
                <div className="flex items-start gap-1.5 mt-2 text-sm text-gray-400">
                  <MessageSquare size={14} className="mt-0.5 shrink-0 text-am-accent/60" />
                  <span className="italic">{pipeline.custom_instructions}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!['failed', 'rejected', 'merged', 'awaiting_approval'].includes(pipeline.status) && (
                <button
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      await api.stopPipeline(pipeline.id);
                      toast('Pipeline stopped', 'info');
                      const updated = await api.getPipeline(pipelineId);
                      setPipeline(updated);
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Failed to stop', 'error');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-red-600/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-600/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Square size={14} /> Stop
                </button>
              )}
              {(pipeline.status === 'failed' || pipeline.status === 'rejected') && (
                <button
                  onClick={() => setShowRetryPrompt(!showRetryPrompt)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-am-accent/10 border border-am-accent/20 text-am-accent-light rounded-lg text-sm font-medium hover:bg-am-accent/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Retry
                </button>
              )}
              {['merged', 'rejected', 'failed'].includes(pipeline.status) && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Delete?</span>
                      <button
                        onClick={async () => {
                          setActionLoading(true);
                          try {
                            await api.deletePipeline(pipeline.id);
                            toast('Pipeline deleted', 'info');
                            router.push('/pipelines');
                          } catch (err) {
                            toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
                          } finally {
                            setActionLoading(false);
                            setShowDeleteConfirm(false);
                          }
                        }}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 bg-am-dark border border-am-border text-gray-400 rounded-lg text-xs hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 bg-am-dark border border-am-border text-gray-400 rounded-lg text-sm hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Retry with Custom Instructions */}
          {showRetryPrompt && (
            <div className="bg-am-card rounded-xl border border-am-accent/20 p-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={16} className="text-am-accent" />
                <h3 className="text-white text-sm font-semibold">Retry with Instructions</h3>
                <span className="text-xs text-am-muted">Guide the agents on what to do differently</span>
              </div>
              <textarea
                placeholder="e.g. Use React instead of vanilla JS, keep changes minimal, focus on the theme toggle only..."
                value={retryInstructions}
                onChange={(e) => setRetryInstructions(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-am-dark border border-am-border rounded-lg text-white placeholder-am-muted text-sm focus:outline-none focus:border-am-accent resize-none transition-colors mb-3"
              />
              {pipeline.custom_instructions && (
                <p className="text-xs text-am-muted mb-3">
                  Previous instructions: <span className="text-gray-400">{pipeline.custom_instructions}</span>
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      const result = await api.retryPipeline(pipeline.id, retryInstructions);
                      toast('Pipeline retry started!', 'success');
                      router.push(`/pipelines/${result.pipeline_id}`);
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Failed to retry', 'error');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-am-accent hover:bg-am-accent/80 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  {retryInstructions.trim() ? 'Retry with Instructions' : 'Retry'}
                </button>
                <button
                  onClick={() => { setShowRetryPrompt(false); setRetryInstructions(''); }}
                  className="px-4 py-2 bg-am-dark border border-am-border text-gray-400 rounded-lg text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pipeline Flow Visualization */}
          <PipelineTimeline pipeline={pipeline} />

          {/* Approval Gateway */}
          {pipeline.status === 'awaiting_approval' && (
            <ApprovalGateway
              pipeline={pipeline}
              onAction={() => {
                api.getPipeline(pipelineId).then(setPipeline);
              }}
            />
          )}

          {/* Tabs */}
          <div className="border-b border-am-border">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'bg-am-card text-white border border-am-border border-b-transparent'
                        : 'text-am-muted hover:text-gray-300'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                {!['failed', 'rejected', 'merged', 'awaiting_approval'].includes(pipeline.status) && (
                  <LiveActivityPanel pipelineId={pipeline.id} status={pipeline.status} />
                )}
                {pipeline.agent_messages.length === 0 && ['failed', 'rejected', 'merged', 'awaiting_approval'].includes(pipeline.status) ? (
                  <div className="glass rounded-xl p-8 text-center">
                    <p className="text-am-muted text-sm">No agent messages recorded</p>
                  </div>
                ) : pipeline.agent_messages.length === 0 ? (
                  <div className="glass rounded-xl p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-am-accent/10 flex items-center justify-center mx-auto mb-3">
                      <Loader2 size={24} className="text-am-accent animate-spin" />
                    </div>
                    <p className="text-white font-medium">Agents are working...</p>
                    <p className="text-am-muted text-sm mt-1">Messages will appear here in real-time</p>
                  </div>
                ) : (
                  pipeline.agent_messages.map((msg) => (
                    <AgentMessageCard key={msg.id} message={msg} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {activeTab === 'code' && (
              <CodeDiffView changes={pipeline.code_changes} />
            )}

            {activeTab === 'tests' && (
              <TestResultsPanel results={pipeline.test_results} />
            )}

            {activeTab === 'review' && (
              <ReviewScores score={pipeline.review_score} findings={pipeline.security_findings} />
            )}
          </div>

          {/* Error display */}
          {pipeline.error_message && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 font-medium text-sm">Pipeline Error</p>
              <p className="text-red-300/80 text-xs mt-1 font-mono">{pipeline.error_message}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
