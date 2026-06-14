'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  BarChart3,
  GitBranch,
  Bot,
  Map,
  Brain,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Zap,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/repo', label: 'Repo Map', icon: Map },
  { href: '/memory', label: 'Memory', icon: Brain },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const sidebarContent = (
    <>
      <div className={`p-4 border-b border-am-border ${collapsed ? 'px-3' : 'p-6'}`}>
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-am-accent to-purple-600 rounded-xl flex items-center justify-center text-lg font-bold shrink-0">
            A
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-white font-semibold text-lg leading-tight">AutoMaintainer</h1>
              <p className="text-am-muted text-xs">AI Engineering Team</p>
            </div>
          )}
        </Link>
      </div>

      <nav className={`flex-1 p-3 space-y-1 ${collapsed ? 'px-2' : 'p-4'}`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium group ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-am-accent/10 text-am-accent-light border border-am-accent/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Icon size={18} className={`shrink-0 transition-colors ${isActive ? 'text-am-accent-light' : 'text-gray-400 group-hover:text-gray-200'}`} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className={`p-3 border-t border-am-border space-y-2 ${collapsed ? 'px-2' : 'p-4'}`}>
        {!collapsed && (
          <div className="glass rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-am-success animate-pulse" />
              <span className="text-xs font-medium text-am-success">System Online</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-am-muted">
              <Zap size={12} />
              <span>7 agents ready</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center py-1" title="System Online">
            <div className="w-2.5 h-2.5 rounded-full bg-am-success animate-pulse" />
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors flex items-center gap-2 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign out'}
        </button>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex w-full items-center justify-center py-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-am-card border border-am-border text-gray-300 hover:text-white transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <aside
            className="w-64 bg-am-darker h-screen flex flex-col animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden md:flex ${collapsed ? 'w-[68px]' : 'w-64'} bg-am-darker border-r border-am-border flex-col h-screen sticky top-0 transition-all duration-300`}>
        {sidebarContent}
      </aside>
    </>
  );
}
