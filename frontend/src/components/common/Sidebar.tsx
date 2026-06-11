'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/pipelines', label: 'Pipelines', icon: '🔄' },
  { href: '/agents', label: 'Agents', icon: '🤖' },
  { href: '/repo', label: 'Repo Map', icon: '🗺️' },
  { href: '/memory', label: 'Memory', icon: '🧠' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <aside className="w-64 bg-am-darker border-r border-am-border flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-am-border">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-am-accent to-purple-600 rounded-xl flex items-center justify-center text-lg font-bold">
            A
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg leading-tight">AutoMaintainer</h1>
            <p className="text-am-muted text-xs">AI Engineering Team</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                isActive
                  ? 'bg-am-accent/10 text-am-accent-light border border-am-accent/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-am-border space-y-2">
        <div className="glass rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-am-success animate-pulse" />
            <span className="text-xs font-medium text-am-success">System Online</span>
          </div>
          <p className="text-xs text-am-muted">7 agents active</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
