import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // TODO: Implement Cognito authentication
      // For now, this is a placeholder that simulates the auth flow

      if (!showMfa) {
        // Simulate initial auth - would normally call Cognito
        setShowMfa(true);
        setLoading(false);
        return;
      }

      // Simulate MFA verification
      // In production, this would verify with Cognito and get JWT tokens
      console.log('Auth:', { email, mfaCode });

      // Store token (placeholder)
      localStorage.setItem('admin_auth', 'placeholder_token');

      // Redirect to dashboard
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Login</h1>
          <p className="mt-2 text-gray-600">
            Accountability Ledger Administration
          </p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {!showMfa ? (
              <>
                <div>
                  <label htmlFor="email" className="label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="mfaCode" className="label">
                  MFA Code
                </label>
                <input
                  id="mfaCode"
                  type="text"
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="input"
                  placeholder="Enter 6-digit code"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Enter the code from your authenticator app.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : showMfa ? 'Verify' : 'Sign In'}
            </button>

            {showMfa && (
              <button
                type="button"
                onClick={() => setShowMfa(false)}
                className="btn-secondary w-full"
              >
                Back
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Admin accounts are manually provisioned. Contact your administrator
          for access.
        </p>
      </div>
    </div>
  );
}
