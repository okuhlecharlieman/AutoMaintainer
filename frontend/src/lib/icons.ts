import {
  Search, Landmark, Code, FlaskConical, Shield, FileText, Eye,
  Clock, Pause, CheckCircle, XCircle, GitPullRequest, AlertTriangle,
  LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Search,
  Landmark,
  Code,
  FlaskConical,
  Shield,
  FileText,
  Eye,
  Clock,
  Pause,
  CheckCircle,
  XCircle,
  GitMerge: GitPullRequest,
  GitPullRequest,
  AlertTriangle,
};

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Clock;
}
