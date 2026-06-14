'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/common/Sidebar';
import StatusBadge from '@/components/common/StatusBadge';
import AgentMessageCard from '@/components/pipeline/AgentMessageCard';
import PipelineTimeline from '@/components/pipeline/PipelineTimeline';
import CodeDiffView from '@/components/pipeline/CodeDiffView';
import ApprovalGateway from '@/components/pipeline/ApprovalGateway';
import ReviewScores from '@/components/pipeline/ReviewScores';
import TestResultsPanel from '@/components/pipeline/TestResultsPanel';
import { api } from '@/lib/api';
import { PipelineRun } from '@/types';
import { ChevronRight, ExternalLink, Loader2, ClipboardList, Code, FlaskConical, Eye } from 'lucide-react';

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = params.id as string;
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'code' | 'tests' | 'review'>('timeline');
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
            </div>
          </div>

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
                {pipeline.agent_messages.length === 0 ? (
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
