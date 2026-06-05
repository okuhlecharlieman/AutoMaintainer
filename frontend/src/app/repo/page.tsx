'use client';

import Sidebar from '@/components/common/Sidebar';

// Repo map is currently a placeholder — will be populated from real GitHub data when pipelines run

// Tree component removed — was showing hardcoded demo data only

export default function RepoMapPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Repository Map</h1>
            <p className="text-am-muted mt-1">Interactive codebase visualization and dependency mapping</p>
          </div>

          <div className="glass rounded-xl p-12 text-center">
            <p className="text-5xl mb-4">🗺️</p>
            <p className="text-white font-medium text-lg">Repository visualization coming soon</p>
            <p className="text-am-muted text-sm mt-2 max-w-md mx-auto">
              Run a pipeline to populate the repository map with real file tree, dependency graph, and architecture patterns from your target repo.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
