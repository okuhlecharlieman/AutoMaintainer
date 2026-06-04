'use client';

import { TestResult } from '@/types';

interface Props {
  results: TestResult[];
}

export default function TestResultsPanel({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-4xl mb-3">🧪</p>
        <p className="text-white font-medium">No test results yet</p>
        <p className="text-am-muted text-sm mt-1">Tests will appear after the QA agent completes</p>
      </div>
    );
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((acc, r) => acc + (r.duration_ms || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-am-card rounded-xl border border-am-border p-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧪</span>
          <div>
            <p className="text-white font-bold">{passed}/{results.length} Passed</p>
            <p className="text-am-muted text-xs">{totalDuration}ms total</p>
          </div>
        </div>
        <div className="flex-1 h-2 bg-am-dark rounded-full overflow-hidden">
          <div className="flex h-full">
            <div className="bg-am-success h-full" style={{ width: `${(passed / results.length) * 100}%` }} />
            <div className="bg-am-danger h-full" style={{ width: `${(failed / results.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-am-success">✓ {passed}</span>
          <span className="text-am-danger">✗ {failed}</span>
        </div>
      </div>

      {/* Test list */}
      <div className="space-y-2">
        {results.map((result, idx) => (
          <div
            key={idx}
            className={`bg-am-card rounded-lg border p-4 ${
              result.passed ? 'border-am-success/20' : 'border-am-danger/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-lg ${result.passed ? 'text-am-success' : 'text-am-danger'}`}>
                  {result.passed ? '✅' : '❌'}
                </span>
                <div>
                  <p className="text-white text-sm font-medium font-mono">{result.test_name}</p>
                  {result.duration_ms && (
                    <p className="text-am-muted text-xs">{result.duration_ms}ms</p>
                  )}
                </div>
              </div>
            </div>
            {result.output && (
              <div className="mt-2 p-2 bg-am-dark rounded text-xs font-mono text-gray-400 max-h-32 overflow-auto">
                {result.output}
              </div>
            )}
            {result.error_message && (
              <div className="mt-2 p-2 bg-red-900/20 rounded text-xs font-mono text-red-300">
                {result.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
