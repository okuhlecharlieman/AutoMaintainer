'use client';

import Sidebar from '@/components/common/Sidebar';
import Link from 'next/link';
import { ChevronRight, Map, GitBranch } from 'lucide-react';

export default function RepoMapPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto pt-8 md:pt-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-am-muted mb-6">
            <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">Repo Map</span>
          </nav>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Repository Map</h1>
            <p className="text-am-muted mt-1">Interactive codebase visualization and dependency mapping</p>
          </div>

          <div className="glass rounded-xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-am-info/20 to-am-accent/20 flex items-center justify-center mx-auto mb-4">
              <Map size={28} className="text-am-info" />
            </div>
            <p className="text-white font-medium text-lg">Repository visualization coming soon</p>
            <p className="text-am-muted text-sm mt-2 max-w-md mx-auto">
              Run a pipeline to populate the repository map with real file tree, dependency graph, and architecture patterns from your target repo.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-am-accent/10 text-am-accent-light rounded-lg text-sm font-medium hover:bg-am-accent/20 transition-colors"
            >
              <GitBranch size={16} />
              Go to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
