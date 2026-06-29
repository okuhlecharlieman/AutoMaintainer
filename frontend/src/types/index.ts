export type AgentRole = 'issue_analyst' | 'architect' | 'developer' | 'qa_tester' | 'security' | 'documentation' | 'reviewer';

export type PipelineStatus = 'pending' | 'analyzing' | 'planning' | 'developing' | 'testing' | 'security_scan' | 'reviewing' | 'documenting' | 'awaiting_approval' | 'approved' | 'rejected' | 'merged' | 'failed';

export interface AgentMessage {
  id: string;
  agent_role: AgentRole;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  thinking?: string;
}

export interface CodeChange {
  file_path: string;
  original_content?: string;
  new_content: string;
  change_type: 'create' | 'modify' | 'delete';
  diff?: string;
  language?: string;
}

export interface TestResult {
  test_name: string;
  passed: boolean;
  output: string;
  duration_ms?: number;
  error_message?: string;
}

export interface SecurityFinding {
  severity: string;
  category: string;
  description: string;
  file_path?: string;
  line_number?: number;
  recommendation: string;
}

export interface ReviewScore {
  readability: number;
  maintainability: number;
  security: number;
  performance: number;
  overall: number;
  comments: string[];
  suggestions: string[];
}

export interface PipelineRun {
  id: string;
  repo_url: string;
  issue_url: string;
  issue_number: number;
  issue_title: string;
  status: PipelineStatus;
  agent_messages: AgentMessage[];
  code_changes: CodeChange[];
  test_results: TestResult[];
  security_findings: SecurityFinding[];
  review_score?: ReviewScore;
  pr_url?: string;
  pr_title?: string;
  pr_body?: string;
  custom_instructions?: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  failed_at_status?: PipelineStatus;
}

export interface PipelineListItem {
  id: string;
  issue_title: string;
  issue_number: number;
  repo_url: string;
  status: PipelineStatus;
  pr_url?: string;
  review_score?: number;
  files_changed: number;
  tests_passed: number;
  tests_total: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntry {
  id: string;
  repo_url: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  relevance_score: number;
}

export const AGENT_CONFIG: Record<AgentRole, { name: string; icon: string; color: string; description: string }> = {
  issue_analyst: { name: 'Issue Analyst', icon: 'Search', color: '#6366f1', description: 'Analyzes and classifies GitHub issues' },
  architect: { name: 'Architect', icon: 'Landmark', color: '#8b5cf6', description: 'Plans implementation approach' },
  developer: { name: 'Developer', icon: 'Code', color: '#10b981', description: 'Writes and modifies code' },
  qa_tester: { name: 'QA Tester', icon: 'FlaskConical', color: '#f59e0b', description: 'Generates and runs tests' },
  security: { name: 'Security Scanner', icon: 'Shield', color: '#ef4444', description: 'Scans for vulnerabilities' },
  documentation: { name: 'Documentation', icon: 'FileText', color: '#3b82f6', description: 'Generates docs and changelogs' },
  reviewer: { name: 'Code Reviewer', icon: 'Eye', color: '#ec4899', description: 'Reviews code quality' },
};

export const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#9ca3af', icon: 'Clock' },
  analyzing: { label: 'Analyzing', color: '#6366f1', icon: 'Search' },
  planning: { label: 'Planning', color: '#8b5cf6', icon: 'Landmark' },
  developing: { label: 'Developing', color: '#10b981', icon: 'Code' },
  testing: { label: 'Testing', color: '#f59e0b', icon: 'FlaskConical' },
  security_scan: { label: 'Security Scan', color: '#ef4444', icon: 'Shield' },
  reviewing: { label: 'Reviewing', color: '#ec4899', icon: 'Eye' },
  documenting: { label: 'Documenting', color: '#3b82f6', icon: 'FileText' },
  awaiting_approval: { label: 'Awaiting Approval', color: '#f59e0b', icon: 'Pause' },
  approved: { label: 'Approved', color: '#10b981', icon: 'CheckCircle' },
  rejected: { label: 'Rejected', color: '#ef4444', icon: 'XCircle' },
  merged: { label: 'PR Created', color: '#10b981', icon: 'GitPullRequest' },
  failed: { label: 'Failed', color: '#ef4444', icon: 'AlertTriangle' },
};
