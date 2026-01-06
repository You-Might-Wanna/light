import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from '@ledger/shared';
import { api } from '../../lib/api';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {/* Quick actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link
          to="/admin/cards/new"
          className="card p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            New Evidence Card
          </h2>
          <p className="text-gray-600 text-sm">
            Create a new evidence card with sources and scoring.
          </p>
        </Link>

        <Link
          to="/admin/sources/new"
          className="card p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Upload Source
          </h2>
          <p className="text-gray-600 text-sm">
            Upload and verify a source document.
          </p>
        </Link>

        <Link
          to="/admin/review-queue"
          className="card p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Review Queue
          </h2>
          <p className="text-gray-600 text-sm">
            Review cards pending publication.
          </p>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">
            {loading ? '-' : stats?.publishedCards ?? 0}
          </div>
          <div className="text-sm text-gray-500">Published Cards</div>
        </div>
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">
            {loading ? '-' : stats?.entitiesTracked ?? 0}
          </div>
          <div className="text-sm text-gray-500">Entities Tracked</div>
        </div>
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">
            {loading ? '-' : stats?.totalCards ?? 0}
          </div>
          <div className="text-sm text-gray-500">Total Cards</div>
        </div>
      </div>

      {/* Intake Status */}
      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Link to="/admin/intake" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {loading ? '-' : stats?.pendingIntake ?? 0}
              </div>
              <div className="text-sm text-gray-500">New Intake Items</div>
            </div>
            <div className="text-blue-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
        <Link to="/admin/review-queue" className="card p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {loading ? '-' : (stats?.draftCards ?? 0) + (stats?.reviewCards ?? 0)}
              </div>
              <div className="text-sm text-gray-500">Cards in Review Pipeline</div>
            </div>
            <div className="text-orange-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent activity placeholder */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>
        <div className="text-center py-8 text-gray-500">
          No recent activity to display.
        </div>
      </div>
    </div>
  );
}
