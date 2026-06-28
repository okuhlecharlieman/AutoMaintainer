'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/common/Sidebar';
import { api, AdminUser, AdminStatsResponse } from '@/lib/api';
import { useToast } from '@/components/common/Toast';
import Link from 'next/link';
import {
  ChevronRight, Users, GitBranch,
  Cpu, Activity, CheckCircle, XCircle, Loader2, RefreshCw,
} from 'lucide-react';

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, statsData] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminStats(),
      ]);
      setUsers(usersData.users);
      setTotalUsers(usersData.total_users);
      setStats(statsData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      if (msg.includes('Admin access')) {
        toast('Admin access required', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/" className="hover:text-white transition">Dashboard</Link>
          <ChevronRight size={14} />
          <span className="text-white">Admin</span>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-gray-400 mt-1">User management and system overview</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400">
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-purple-400" size={32} />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                  icon={<Users size={20} />}
                  label="Total Users"
                  value={stats.users.total}
                  color="purple"
                />
                <StatCard
                  icon={<Activity size={20} />}
                  label="Total Pipelines"
                  value={stats.pipelines.total}
                  color="blue"
                />
                <StatCard
                  icon={<CheckCircle size={20} />}
                  label="Success Rate"
                  value={`${stats.pipelines.success_rate}%`}
                  color="green"
                />
                <StatCard
                  icon={<GitBranch size={20} />}
                  label="Unique Repos"
                  value={stats.repos.unique}
                  color="cyan"
                />
              </div>
            )}

            {/* Pipeline Stats */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-400 mb-1">
                    <CheckCircle size={16} />
                    <span className="text-sm font-medium">Successful</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{stats.pipelines.successful}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-400 mb-1">
                    <XCircle size={16} />
                    <span className="text-sm font-medium">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{stats.pipelines.failed}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-yellow-400 mb-1">
                    <Cpu size={16} />
                    <span className="text-sm font-medium">Models Configured</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{stats.system.models_configured}</p>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users size={18} />
                  Users ({totalUsers})
                </h2>
              </div>

              {users.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  No users registered yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 text-left">
                        <th className="px-6 py-3 text-xs font-medium text-gray-400 uppercase">User</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-400 uppercase">GitHub ID</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-400 uppercase">Joined</th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-400 uppercase">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url}
                                  alt={user.github_username}
                                  className="w-8 h-8 rounded-full"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                  <Users size={14} className="text-purple-400" />
                                </div>
                              )}
                              <div>
                                <p className="text-white font-medium">{user.github_username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-sm">{user.github_id}</td>
                          <td className="px-6 py-4 text-gray-400 text-sm">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-sm">
                            {user.last_active ? new Date(user.last_active).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };
  const classes = colorMap[color] || colorMap.purple;

  return (
    <div className={`border rounded-lg p-4 ${classes}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
