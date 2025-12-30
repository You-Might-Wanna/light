import { Link } from 'react-router-dom';

export default function AdminDashboardPage() {
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

      {/* Stats placeholder */}
      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">-</div>
          <div className="text-sm text-gray-500">Published Cards</div>
        </div>
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">-</div>
          <div className="text-sm text-gray-500">Entities Tracked</div>
        </div>
        <div className="card p-6">
          <div className="text-3xl font-bold text-gray-900">-</div>
          <div className="text-sm text-gray-500">Verified Sources</div>
        </div>
        <div className="card p-6">
          <div className="text-3xl font-bold text-yellow-600">-</div>
          <div className="text-sm text-gray-500">Pending Review</div>
        </div>
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
