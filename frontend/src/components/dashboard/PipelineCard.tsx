'use client';

import Link from 'next/link';
import StatusBadge from '@/components/common/StatusBadge';
import { PipelineListItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Star, FileText, FlaskConical, Clock } from 'lucide-react';

interface Props {
  pipeline: PipelineListItem;
}

export default function PipelineCard({ pipeline }: Props) {
  const timeAgo = formatDistanceToNow(new Date(pipeline.created_at), { addSuffix: true });

  return (
    <Link href={`/pipelines/${pipeline.id}`}>
      <div className="bg-am-card rounded-xl border border-am-border p-5 hover:border-am-accent/30 transition-all hover:shadow-lg hover:shadow-am-accent/5 cursor-pointer group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium text-sm truncate group-hover:text-am-accent-light transition-colors">
              #{pipeline.issue_number} {pipeline.issue_title}
            </h3>
            <p className="text-am-muted text-xs mt-1 truncate">{pipeline.repo_url}</p>
          </div>
          <StatusBadge status={pipeline.status} />
        </div>

        <div className="flex items-center gap-4 text-xs text-am-muted">
          {pipeline.review_score != null && (
            <span className="flex items-center gap-1">
              <Star size={12} />
              {pipeline.review_score.toFixed(1)}/10
            </span>
          )}
          <span className="flex items-center gap-1">
            <FileText size={12} />
            {pipeline.files_changed} files
          </span>
          <span className="flex items-center gap-1">
            <FlaskConical size={12} />
            {pipeline.tests_passed}/{pipeline.tests_total}
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <Clock size={12} />
            {timeAgo}
          </span>
        </div>
      </div>
    </Link>
  );
}
