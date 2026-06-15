'use client';

import { useState } from 'react';
import { CodeChange } from '@/types';
import { Code, Plus, Minus, Pencil } from 'lucide-react';

interface Props {
  changes: CodeChange[];
}

export default function CodeDiffView({ changes }: Props) {
  const [selectedFile, setSelectedFile] = useState(0);

  if (changes.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-am-accent/10 flex items-center justify-center mx-auto mb-3">
          <Code size={24} className="text-am-accent" />
        </div>
        <p className="text-white font-medium">No code changes yet</p>
        <p className="text-am-muted text-sm mt-1">Changes will appear here when the Developer agent completes</p>
      </div>
    );
  }

  // Parse diff lines to show added/removed context
  const parseDiffLines = (diff?: string) => {
    if (!diff) return null;
    return diff.split('\n').map((line, i) => {
      let className = 'text-gray-300';
      let prefix = '';
      
      if (line.startsWith('+++') || line.startsWith('---')) {
        className = 'text-am-muted font-semibold';
        prefix = line.substring(0, 4);
      } else if (line.startsWith('+')) {
        className = 'text-green-400 bg-green-900/20';
        prefix = '+';
      } else if (line.startsWith('-')) {
        className = 'text-red-400 bg-red-900/20';
        prefix = '-';
      } else if (line.startsWith('@@')) {
        className = 'text-am-accent font-semibold';
        prefix = line.split('@@')[1];
      } else {
        prefix = ' ';
      }
      
      return { line, className, prefix, key: i };
    });
  };

  const diffLines = parseDiffLines(changes[selectedFile]?.diff);
  const hasDiff = diffLines && diffLines.length > 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* File list */}
      <div className="col-span-1 bg-am-card rounded-xl border border-am-border p-3">
        <h3 className="text-xs font-medium text-am-muted uppercase tracking-wider mb-3 px-2">
          Changed Files ({changes.length})
        </h3>
        <div className="space-y-1">
          {changes.map((change, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedFile(idx)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                selectedFile === idx
                  ? 'bg-am-accent/10 text-am-accent-light border border-am-accent/20'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium ${
                  change.change_type === 'create' ? 'bg-green-900/30 text-green-400' :
                  change.change_type === 'delete' ? 'bg-red-900/30 text-red-400' :
                  'bg-yellow-900/30 text-yellow-400'
                }`}>
                  {change.change_type === 'create' ? <Plus size={10} /> : change.change_type === 'delete' ? <Minus size={10} /> : <Pencil size={10} />}
                </span>
                <span className="truncate font-mono">{change.file_path.split('/').pop()}</span>
              </div>
              <p className="text-am-muted text-[10px] mt-0.5 truncate pl-7">{change.file_path}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Code view */}
      <div className="col-span-3 bg-am-card rounded-xl border border-am-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-am-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-white">{changes[selectedFile]?.file_path}</span>
            {changes[selectedFile]?.language && (
              <span className="text-[10px] px-2 py-0.5 bg-am-dark rounded text-am-muted">
                {changes[selectedFile]?.language}
              </span>
            )}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
            changes[selectedFile]?.change_type === 'create' ? 'bg-green-900/30 text-green-400' :
            changes[selectedFile]?.change_type === 'delete' ? 'bg-red-900/30 text-red-400' :
            'bg-yellow-900/30 text-yellow-400'
          }`}>
            {changes[selectedFile]?.change_type}
          </span>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <pre className="code-block p-4 text-xs leading-relaxed">
            <code>
              {hasDiff ? (
                diffLines.map(({ line, className, prefix, key }) => (
                  <div key={key} className={`flex ${className}`}>
                    <span className="text-am-muted/50 select-none w-6 text-right pr-2 shrink-0">{prefix}</span>
                    <span className="flex-1">{line}</span>
                  </div>
                ))
              ) : (
                changes[selectedFile]?.new_content?.split('\n').map((line, i) => (
                  <div key={i} className="flex">
                    <span className="text-am-muted/50 select-none w-10 text-right pr-4 shrink-0">{i + 1}</span>
                    <span className="text-gray-300">{line}</span>
                  </div>
                ))
              )}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
