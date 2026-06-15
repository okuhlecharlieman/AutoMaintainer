'use client';

import { TestResult } from '@/types';
import { FlaskConical, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  results: TestResult[];
}

export default function TestResultsPanel({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
          <FlaskConical size={24} className="text-amber-400" />
        </div>
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
      <div className="bg-am-card rounded-xl border border-am-border p-4 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <FlaskConical size={20} className="text-amber-400" />
          </div>
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
          <span className="text-am-success flex items-center gap-1"><CheckCircle size={14} /> {passed}</span>
          <span className="text-am-danger flex items-center gap-1"><XCircle size={14} /> {failed}</span>
        </div>
      </div>

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
                <span className={result.passed ? 'text-am-success' : 'text-am-danger'}>
                  {result.passed ? <CheckCircle size={18} /> : <XCircle size={18} />}
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
