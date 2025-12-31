import { Outlet, Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  isAdmin?: boolean;
}

export default function Layout({ isAdmin = false }: LayoutProps) {
  const location = useLocation();

  const publicNavItems = [
    { path: '/', label: 'Feed' },
    { path: '/entities', label: 'Entities' },
    { path: '/about', label: 'About' },
    { path: '/corrections', label: 'Corrections' },
  ];

  const adminNavItems = [
    { path: '/admin/dashboard', label: 'Dashboard' },
    { path: '/admin/intake', label: 'Intake Inbox' },
    { path: '/admin/cards/new', label: 'New Card' },
    { path: '/admin/sources/new', label: 'New Source' },
    { path: '/admin/review-queue', label: 'Review Queue' },
  ];

  const navItems = isAdmin ? adminNavItems : publicNavItems;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo */}
              <Link
                to={isAdmin ? '/admin' : '/'}
                className="flex items-center text-xl font-semibold text-primary-900"
              >
                {isAdmin ? 'Admin' : 'Accountability Ledger'}
              </Link>

              {/* Navigation */}
              <nav className="hidden sm:ml-8 sm:flex sm:space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      location.pathname === item.path
                        ? 'bg-primary-100 text-primary-900'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {!isAdmin && (
                <Link
                  to="/admin/login"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Admin
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/"
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Public Site
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Accountability Ledger — Evidence-based public record
            </p>
            <div className="flex space-x-6">
              <Link
                to="/about"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Methodology
              </Link>
              <Link
                to="/corrections"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Corrections
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
