import {
  Search, Landmark, Code, FlaskConical, Shield, FileText, Eye,
  Clock, Pause, CheckCircle, XCircle, GitMerge, AlertTriangle,
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
  GitMerge,
  AlertTriangle,
};

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Clock;
}
