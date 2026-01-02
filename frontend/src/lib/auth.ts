import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { api } from './api';

// Cognito configuration from environment variables
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;

let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!userPool) {
    if (!USER_POOL_ID || !CLIENT_ID) {
      throw new Error('Cognito configuration missing. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID environment variables.');
    }
    userPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
    });
  }
  return userPool;
}

export interface AuthResult {
  success: true;
  session: CognitoUserSession;
}

export interface MfaRequired {
  success: false;
  mfaRequired: true;
  cognitoUser: CognitoUser;
}

export interface NewPasswordRequired {
  success: false;
  newPasswordRequired: true;
  cognitoUser: CognitoUser;
  userAttributes: Record<string, string>;
}

export interface MfaSetupRequired {
  success: false;
  mfaSetupRequired: true;
  cognitoUser: CognitoUser;
  secretCode: string;
}

export interface AuthError {
  success: false;
  mfaRequired?: false;
  newPasswordRequired?: false;
  mfaSetupRequired?: false;
  error: string;
}

export type SignInResult = AuthResult | MfaRequired | NewPasswordRequired | MfaSetupRequired | AuthError;
export type NewPasswordResult = AuthResult | MfaSetupRequired | AuthError;

export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  const pool = getUserPool();

  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: pool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        // Set the token in the API client
        const idToken = session.getIdToken().getJwtToken();
        api.setToken(idToken);

        resolve({ success: true, session });
      },
      onFailure: (err) => {
        resolve({
          success: false,
          error: err.message || 'Authentication failed',
        });
      },
      newPasswordRequired: (userAttributes) => {
        // Remove read-only attributes that can't be changed
        delete userAttributes.email_verified;
        delete userAttributes.phone_number_verified;

        resolve({
          success: false,
          newPasswordRequired: true,
          cognitoUser,
          userAttributes,
        });
      },
      totpRequired: () => {
        resolve({
          success: false,
          mfaRequired: true,
          cognitoUser,
        });
      },
      mfaRequired: () => {
        // SMS MFA (not used, but handle it)
        resolve({
          success: false,
          mfaRequired: true,
          cognitoUser,
        });
      },
      mfaSetup: () => {
        // MFA setup is required - get TOTP secret
        cognitoUser.associateSoftwareToken({
          associateSecretCode: (secretCode: string) => {
            resolve({
              success: false,
              mfaSetupRequired: true,
              cognitoUser,
              secretCode,
            });
          },
          onFailure: (err) => {
            resolve({
              success: false,
              error: err.message || 'Failed to set up MFA',
            });
          },
        });
      },
    });
  });
}

export async function completeNewPassword(
  cognitoUser: CognitoUser,
  newPassword: string,
  userAttributes: Record<string, string> = {}
): Promise<NewPasswordResult> {
  return new Promise((resolve) => {
    cognitoUser.completeNewPasswordChallenge(newPassword, userAttributes, {
      onSuccess: (session) => {
        // Set the token in the API client
        const idToken = session.getIdToken().getJwtToken();
        api.setToken(idToken);

        resolve({ success: true, session });
      },
      onFailure: (err) => {
        resolve({
          success: false,
          error: err.message || 'Failed to set new password',
        });
      },
      mfaSetup: () => {
        // MFA setup is required - get TOTP secret
        cognitoUser.associateSoftwareToken({
          associateSecretCode: (secretCode: string) => {
            resolve({
              success: false,
              mfaSetupRequired: true,
              cognitoUser,
              secretCode,
            });
          },
          onFailure: (err) => {
            resolve({
              success: false,
              error: err.message || 'Failed to set up MFA',
            });
          },
        });
      },
    });
  });
}

export async function verifyMfaSetup(
  cognitoUser: CognitoUser,
  totpCode: string
): Promise<AuthResult | AuthError> {
  return new Promise((resolve) => {
    cognitoUser.verifySoftwareToken(totpCode, 'Authenticator', {
      onSuccess: (session) => {
        // Set the token in the API client
        const idToken = session.getIdToken().getJwtToken();
        api.setToken(idToken);

        resolve({ success: true, session });
      },
      onFailure: (err) => {
        resolve({
          success: false,
          error: err.message || 'MFA verification failed',
        });
      },
    });
  });
}

export async function verifyMfa(
  cognitoUser: CognitoUser,
  mfaCode: string
): Promise<AuthResult | AuthError> {
  return new Promise((resolve) => {
    cognitoUser.sendMFACode(
      mfaCode,
      {
        onSuccess: (session) => {
          // Set the token in the API client
          const idToken = session.getIdToken().getJwtToken();
          api.setToken(idToken);

          resolve({ success: true, session });
        },
        onFailure: (err) => {
          resolve({
            success: false,
            error: err.message || 'MFA verification failed',
          });
        },
      },
      'SOFTWARE_TOKEN_MFA'
    );
  });
}

export function signOut(): void {
  const pool = getUserPool();
  const cognitoUser = pool.getCurrentUser();

  if (cognitoUser) {
    cognitoUser.signOut();
  }

  api.setToken(null);
}

export async function getCurrentSession(): Promise<CognitoUserSession | null> {
  const pool = getUserPool();
  const cognitoUser = pool.getCurrentUser();

  if (!cognitoUser) {
    return null;
  }

  return new Promise((resolve) => {
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      // Update API token
      const idToken = session.getIdToken().getJwtToken();
      api.setToken(idToken);

      resolve(session);
    });
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getCurrentSession();
  return session !== null && session.isValid();
}
