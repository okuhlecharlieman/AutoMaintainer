'use client';

import { useState } from 'react';
import Sidebar from '@/components/common/Sidebar';

const DEMO_TREE = [
  { path: 'src', type: 'dir', children: [
    { path: 'src/auth', type: 'dir', children: [
      { path: 'src/auth/login.py', type: 'file', lang: 'python', lines: 142 },
      { path: 'src/auth/session.py', type: 'file', lang: 'python', lines: 89 },
      { path: 'src/auth/middleware.py', type: 'file', lang: 'python', lines: 67 },
    ]},
    { path: 'src/api', type: 'dir', children: [
      { path: 'src/api/routes.py', type: 'file', lang: 'python', lines: 234 },
      { path: 'src/api/models.py', type: 'file', lang: 'python', lines: 156 },
      { path: 'src/api/validators.py', type: 'file', lang: 'python', lines: 78 },
    ]},
    { path: 'src/db', type: 'dir', children: [
      { path: 'src/db/connection.py', type: 'file', lang: 'python', lines: 45 },
      { path: 'src/db/migrations.py', type: 'file', lang: 'python', lines: 312 },
    ]},
    { path: 'src/utils', type: 'dir', children: [
      { path: 'src/utils/logging.py', type: 'file', lang: 'python', lines: 56 },
      { path: 'src/utils/helpers.py', type: 'file', lang: 'python', lines: 98 },
    ]},
  ]},
  { path: 'tests', type: 'dir', children: [
    { path: 'tests/test_auth.py', type: 'file', lang: 'python', lines: 189 },
    { path: 'tests/test_api.py', type: 'file', lang: 'python', lines: 267 },
    { path: 'tests/test_db.py', type: 'file', lang: 'python', lines: 134 },
  ]},
  { path: 'requirements.txt', type: 'file', lang: 'text', lines: 23 },
  { path: 'README.md', type: 'file', lang: 'markdown', lines: 87 },
  { path: 'pyproject.toml', type: 'file', lang: 'toml', lines: 34 },
];

function TreeItem({ node, depth = 0 }: { node: typeof DEMO_TREE[0]; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'dir';
  const children = 'children' in node ? node.children : [];

  return (
    <div>
      <button
        onClick={() => isDir && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/5 text-left text-sm transition-all`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {isDir && (
          <span className="text-am-muted text-xs">{expanded ? '▼' : '▶'}</span>
        )}
        <span className={isDir ? 'text-am-accent-light' : 'text-gray-300'}>
          {isDir ? '📁' : '📄'}
        </span>
        <span className={isDir ? 'text-white font-medium' : 'text-gray-300 font-mono text-xs'}>
          {node.path.split('/').pop()}
        </span>
        {!isDir && 'lang' in node && (
          <span className="text-[10px] text-am-muted ml-auto">
            {node.lines} lines
          </span>
        )}
      </button>
      {expanded && children.map((child, i) => (
        <TreeItem key={i} node={child as typeof DEMO_TREE[0]} depth={depth + 1} />
      ))}
    </div>
  );
}

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

          <div className="grid grid-cols-3 gap-6">
            {/* File Tree */}
            <div className="col-span-1 bg-am-card rounded-xl border border-am-border p-4">
              <h3 className="text-white font-medium text-sm mb-3 px-2">📂 File Explorer</h3>
              <div className="space-y-0.5">
                {DEMO_TREE.map((node, i) => (
                  <TreeItem key={i} node={node} />
                ))}
              </div>
            </div>

            {/* Module Map */}
            <div className="col-span-2 space-y-6">
              {/* Dependency Graph (Visual) */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <h3 className="text-white font-medium text-sm mb-4">🔗 Module Dependencies</h3>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name: 'auth', deps: ['db', 'utils'], color: '#6366f1', files: 3 },
                    { name: 'api', deps: ['auth', 'db'], color: '#10b981', files: 3 },
                    { name: 'db', deps: ['utils'], color: '#f59e0b', files: 2 },
                    { name: 'utils', deps: [], color: '#3b82f6', files: 2 },
                    { name: 'tests', deps: ['auth', 'api', 'db'], color: '#ec4899', files: 3 },
                  ].map((mod) => (
                    <div
                      key={mod.name}
                      className="p-4 rounded-xl border-2 text-center"
                      style={{ borderColor: `${mod.color}40`, backgroundColor: `${mod.color}08` }}
                    >
                      <div className="text-lg font-bold" style={{ color: mod.color }}>{mod.name}</div>
                      <div className="text-xs text-am-muted mt-1">{mod.files} files</div>
                      {mod.deps.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 justify-center">
                          {mod.deps.map((dep) => (
                            <span key={dep} className="text-[10px] px-2 py-0.5 bg-am-dark rounded text-gray-400">
                              → {dep}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Code Metrics */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <h3 className="text-white font-medium text-sm mb-4">📊 Code Metrics</h3>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total Files', value: '15', icon: '📄' },
                    { label: 'Lines of Code', value: '1,990', icon: '📝' },
                    { label: 'Test Coverage', value: '78%', icon: '🧪' },
                    { label: 'Complexity', value: 'Medium', icon: '📈' },
                  ].map((metric) => (
                    <div key={metric.label} className="bg-am-dark rounded-lg p-4 text-center">
                      <div className="text-2xl mb-2">{metric.icon}</div>
                      <div className="text-white font-bold text-xl">{metric.value}</div>
                      <div className="text-am-muted text-xs mt-1">{metric.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ownership Patterns */}
              <div className="bg-am-card rounded-xl border border-am-border p-6">
                <h3 className="text-white font-medium text-sm mb-4">👥 Architecture Patterns Detected</h3>
                <div className="space-y-2">
                  {[
                    'Modular architecture with clear separation of concerns',
                    'Authentication middleware pattern for API protection',
                    'Database migrations managed via versioned scripts',
                    'Comprehensive test suite mirroring source structure',
                    'Centralized logging and utility modules',
                  ].map((pattern, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-am-accent mt-0.5">•</span>
                      <span>{pattern}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
