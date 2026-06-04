'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
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

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = params.id as string;
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'code' | 'tests' | 'review'>('timeline');
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pipeline?.agent_messages]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
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
    { id: 'timeline' as const, label: 'Agent Timeline', icon: '📋' },
    { id: 'code' as const, label: 'Code Changes', icon: '💻' },
    { id: 'tests' as const, label: 'Test Results', icon: '🧪' },
    { id: 'review' as const, label: 'Review', icon: '👁️' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-6">
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
                <a href={pipeline.pr_url} target="_blank" rel="noopener noreferrer" className="text-am-accent text-sm hover:underline mt-1 inline-block">
                  🔗 View Pull Request
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
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-am-card text-white border border-am-border border-b-transparent'
                      : 'text-am-muted hover:text-gray-300'
                  }`}
                >
                  <span className="mr-1.5">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                {pipeline.agent_messages.length === 0 ? (
                  <div className="glass rounded-xl p-8 text-center">
                    <p className="text-4xl mb-3">🤖</p>
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
