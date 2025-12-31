import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CognitoUser } from 'amazon-cognito-identity-js';
import { signIn, verifyMfa, completeNewPassword, verifyMfaSetup } from '../../lib/auth';

type AuthStep = 'credentials' | 'newPassword' | 'mfaSetup' | 'mfa';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [totpSecretCode, setTotpSecretCode] = useState('');
  const [step, setStep] = useState<AuthStep>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (step === 'credentials') {
        const result = await signIn(email, password);

        if (result.success) {
          navigate('/admin/dashboard');
          return;
        }

        if ('newPasswordRequired' in result && result.newPasswordRequired) {
          setCognitoUser(result.cognitoUser);
          setStep('newPassword');
          return;
        }

        if ('mfaSetupRequired' in result && result.mfaSetupRequired) {
          setCognitoUser(result.cognitoUser);
          setTotpSecretCode(result.secretCode);
          setStep('mfaSetup');
          return;
        }

        if ('mfaRequired' in result && result.mfaRequired) {
          setCognitoUser(result.cognitoUser);
          setStep('mfa');
          return;
        }

        if ('error' in result) {
          setError(result.error);
        }
      } else if (step === 'newPassword') {
        if (!cognitoUser) {
          setError('Session expired. Please sign in again.');
          handleBack();
          return;
        }

        if (newPassword !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        if (newPassword.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }

        const result = await completeNewPassword(cognitoUser, newPassword);

        if (result.success) {
          navigate('/admin/dashboard');
          return;
        }

        if ('mfaSetupRequired' in result && result.mfaSetupRequired) {
          setCognitoUser(result.cognitoUser);
          setTotpSecretCode(result.secretCode);
          setStep('mfaSetup');
          return;
        }

        if ('error' in result) {
          setError(result.error);
        }
      } else if (step === 'mfaSetup') {
        if (!cognitoUser) {
          setError('Session expired. Please sign in again.');
          handleBack();
          return;
        }

        const result = await verifyMfaSetup(cognitoUser, mfaCode);

        if (result.success) {
          navigate('/admin/dashboard');
          return;
        }

        setError(result.error);
      } else if (step === 'mfa') {
        if (!cognitoUser) {
          setError('Session expired. Please sign in again.');
          handleBack();
          return;
        }

        const result = await verifyMfa(cognitoUser, mfaCode);

        if (result.success) {
          navigate('/admin/dashboard');
          return;
        }

        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep('credentials');
    setMfaCode('');
    setNewPassword('');
    setConfirmPassword('');
    setTotpSecretCode('');
    setCognitoUser(null);
    setError(null);
  }

  function getButtonText() {
    if (loading) return 'Please wait...';
    switch (step) {
      case 'credentials':
        return 'Sign In';
      case 'newPassword':
        return 'Set New Password';
      case 'mfaSetup':
        return 'Verify & Enable MFA';
      case 'mfa':
        return 'Verify';
    }
  }

  function getTotpUri() {
    if (!totpSecretCode || !email) return '';
    const issuer = encodeURIComponent('AccountabilityLedger');
    const account = encodeURIComponent(email);
    return `otpauth://totp/${issuer}:${account}?secret=${totpSecretCode}&issuer=${issuer}`;
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

            {step === 'credentials' && (
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
            )}

            {step === 'newPassword' && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    You must set a new password before continuing.
                  </p>
                </div>

                <div>
                  <label htmlFor="newPassword" className="label">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                    minLength={8}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Must be at least 8 characters
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="label">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    minLength={8}
                  />
                </div>
              </>
            )}

            {step === 'mfaSetup' && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    Set up two-factor authentication to secure your account.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      1. Scan this QR code with your authenticator app:
                    </p>
                    <div className="flex justify-center p-4 bg-white rounded-lg border">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getTotpUri())}`}
                        alt="TOTP QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Or enter this code manually:
                    </p>
                    <code className="block p-3 bg-gray-100 rounded text-sm font-mono break-all text-center">
                      {totpSecretCode}
                    </code>
                  </div>

                  <div>
                    <label htmlFor="mfaCode" className="label">
                      2. Enter the 6-digit code from your app:
                    </label>
                    <input
                      id="mfaCode"
                      type="text"
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="input"
                      placeholder="000000"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 'mfa' && (
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
              {getButtonText()}
            </button>

            {step !== 'credentials' && (
              <button
                type="button"
                onClick={handleBack}
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