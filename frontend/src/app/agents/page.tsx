'use client';

import Sidebar from '@/components/common/Sidebar';
import { AGENT_CONFIG, AgentRole } from '@/types';
import { Search, Landmark, Code, FlaskConical, Shield, FileText, Eye, ChevronRight } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

const AGENT_ICONS: Record<AgentRole, LucideIcon> = {
  issue_analyst: Search,
  architect: Landmark,
  developer: Code,
  qa_tester: FlaskConical,
  security: Shield,
  documentation: FileText,
  reviewer: Eye,
};

export default function AgentsPage() {
  const agents = Object.entries(AGENT_CONFIG) as [AgentRole, typeof AGENT_CONFIG[AgentRole]][];

  const agentDetails: Record<AgentRole, { capabilities: string[]; tools: string[]; type: string }> = {
    issue_analyst: {
      capabilities: ['Classify issue severity', 'Extract requirements', 'Identify affected files', 'Suggest reproduction steps', 'Estimate complexity'],
      tools: ['GitHub API', 'Codebase Scanner', 'Memory System'],
      type: 'Core',
    },
    architect: {
      capabilities: ['Analyze project structure', 'Plan implementation approach', 'Prevent bad patterns', 'Map dependencies', 'Assess complexity'],
      tools: ['Dependency Graph', 'Codebase Analyzer', 'Memory System'],
      type: 'Core',
    },
    developer: {
      capabilities: ['Write production code', 'Follow repo conventions', 'Handle edge cases', 'Minimal changes principle', 'Language detection'],
      tools: ['Code Editor', 'File System', 'GitHub API'],
      type: 'Core',
    },
    qa_tester: {
      capabilities: ['Generate comprehensive tests', 'Identify edge cases', 'Validate requirements', 'Check regressions', 'Coverage assessment'],
      tools: ['Test Runner', 'Sandbox', 'Coverage Analyzer'],
      type: 'Core',
    },
    security: {
      capabilities: ['Scan for vulnerabilities', 'Check dependencies', 'Detect insecure patterns', 'Risk assessment', 'Recommendation generation'],
      tools: ['Security Scanner', 'Dependency Checker', 'CVE Database'],
      type: 'Stub',
    },
    documentation: {
      capabilities: ['Generate PR descriptions', 'Write changelogs', 'Update docs', 'Create commit messages', 'Conventional commits'],
      tools: ['Markdown Generator', 'Doc Scanner', 'Changelog Builder'],
      type: 'Stub',
    },
    reviewer: {
      capabilities: ['Multi-dimensional scoring', 'Best practice checks', 'Bug detection', 'Performance analysis', 'Approval decisions'],
      tools: ['Code Analyzer', 'Style Checker', 'Quality Metrics'],
      type: 'Core',
    },
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto pt-8 md:pt-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-am-muted mb-6">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">Agents</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">AI Engineering Team</h1>
            <p className="text-am-muted mt-1">7 specialized agents working as a coordinated engineering organization</p>
          </div>

          {/* Agent Pipeline Flow */}
          <div className="bg-am-card rounded-xl border border-am-border p-6 mb-8">
            <h2 className="text-white font-semibold mb-4">Agent Pipeline Flow</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {agents.map(([role, config], idx) => {
                const Icon = AGENT_ICONS[role];
                return (
                  <div key={role} className="flex items-center shrink-0">
                    <div
                      className="px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2"
                      style={{
                        borderColor: `${config.color}40`,
                        backgroundColor: `${config.color}10`,
                        color: config.color,
                      }}
                    >
                      <Icon size={16} />
                      {config.name}
                    </div>
                    {idx < agents.length - 1 && (
                      <ChevronRight size={18} className="text-am-muted mx-1 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {agents.map(([role, config]) => {
              const details = agentDetails[role];
              const Icon = AGENT_ICONS[role];
              return (
                <div
                  key={role}
                  className="bg-am-card rounded-xl border border-am-border p-6 hover:border-opacity-50 transition-all group"
                  style={{ borderColor: `${config.color}30` }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${config.color}20` }}
                    >
                      <Icon size={24} style={{ color: config.color }} />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{config.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          details.type === 'Core' ? 'bg-am-accent/20 text-am-accent-light' : 'bg-am-muted/20 text-am-muted'
                        }`}>
                          {details.type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-400 text-sm mb-4">{config.description}</p>

                  <div className="mb-3">
                    <p className="text-xs text-am-muted font-medium uppercase tracking-wider mb-2">Capabilities</p>
                    <div className="space-y-1">
                      {details.capabilities.map((cap, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                          <span style={{ color: config.color }}>&#10003;</span>
                          {cap}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-am-muted font-medium uppercase tracking-wider mb-2">Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {details.tools.map((tool, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 bg-am-dark rounded-md text-gray-400 border border-am-border">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
