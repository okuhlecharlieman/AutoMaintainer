'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, BarChart3, GitBranch, Bot, Map, Brain, Settings,
  Rocket, ArrowRight,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
  category: 'navigation' | 'action';
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const commands: CommandItem[] = [
    { id: 'nav-dashboard', label: 'Dashboard', description: 'View overview and stats', icon: BarChart3, action: () => router.push('/'), category: 'navigation' },
    { id: 'nav-pipelines', label: 'Pipelines', description: 'View all pipelines', icon: GitBranch, action: () => router.push('/pipelines'), category: 'navigation' },
    { id: 'nav-agents', label: 'Agents', description: 'View agent information', icon: Bot, action: () => router.push('/agents'), category: 'navigation' },
    { id: 'nav-repo', label: 'Repo Map', description: 'View repository structure', icon: Map, action: () => router.push('/repo'), category: 'navigation' },
    { id: 'nav-memory', label: 'Memory', description: 'View stored knowledge', icon: Brain, action: () => router.push('/memory'), category: 'navigation' },
    { id: 'nav-settings', label: 'Settings', description: 'System configuration', icon: Settings, action: () => router.push('/settings'), category: 'navigation' },
  ];

  const filtered = commands.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(query.toLowerCase()))
  );

  const grouped = {
    navigation: filtered.filter((c) => c.category === 'navigation'),
    action: filtered.filter((c) => c.category === 'action'),
  };

  const flatFiltered = [...grouped.navigation, ...grouped.action];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = (cmd: CommandItem) => {
    cmd.action();
    setOpen(false);
    setQuery('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-am-card border border-am-border rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-am-border">
          <Search size={18} className="text-am-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
                e.preventDefault();
                executeCommand(flatFiltered[selectedIndex]);
              }
            }}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-white placeholder-am-muted text-sm focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 bg-am-dark border border-am-border rounded text-am-muted font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {flatFiltered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-am-muted text-sm">No results found</p>
            </div>
          ) : (
            <>
              {grouped.navigation.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-am-muted font-medium px-3 py-1.5">Navigate</p>
                  {grouped.navigation.map((cmd) => {
                    const idx = flatFiltered.indexOf(cmd);
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          selectedIndex === idx
                            ? 'bg-am-accent/10 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <Icon size={16} className={selectedIndex === idx ? 'text-am-accent' : 'text-gray-500'} />
                        <div className="flex-1 text-left">
                          <span className="font-medium">{cmd.label}</span>
                          {cmd.description && (
                            <span className="text-xs text-am-muted ml-2">{cmd.description}</span>
                          )}
                        </div>
                        {selectedIndex === idx && <ArrowRight size={14} className="text-am-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {grouped.action.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-am-muted font-medium px-3 py-1.5">Actions</p>
                  {grouped.action.map((cmd) => {
                    const idx = flatFiltered.indexOf(cmd);
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          selectedIndex === idx
                            ? 'bg-am-accent/10 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <Icon size={16} className={selectedIndex === idx ? 'text-am-accent' : 'text-gray-500'} />
                        <div className="flex-1 text-left">
                          <span className="font-medium">{cmd.label}</span>
                          {cmd.description && (
                            <span className="text-xs text-am-muted ml-2">{cmd.description}</span>
                          )}
                        </div>
                        {selectedIndex === idx && <ArrowRight size={14} className="text-am-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-am-border flex items-center justify-between text-[10px] text-am-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-am-dark border border-am-border rounded font-mono">&uarr;</kbd>
              <kbd className="px-1 py-0.5 bg-am-dark border border-am-border rounded font-mono">&darr;</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-am-dark border border-am-border rounded font-mono">Enter</kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-am-dark border border-am-border rounded font-mono">Ctrl+K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}
