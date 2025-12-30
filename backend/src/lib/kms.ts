import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
} from '@aws-sdk/client-kms';
import { config } from './config.js';

// Create KMS client
export const kmsClient = new KMSClient({ region: config.region });

// Sign data with KMS asymmetric key
export async function signData(
  data: Buffer,
  keyId: string = config.kms.signingKeyId,
  algorithm: string = 'RSASSA_PSS_SHA_256'
): Promise<{ signature: string; keyId: string; algorithm: string }> {
  const command = new SignCommand({
    KeyId: keyId,
    Message: data,
    MessageType: 'RAW',
    SigningAlgorithm: algorithm as 'RSASSA_PSS_SHA_256',
  });

  const response = await kmsClient.send(command);

  if (!response.Signature) {
    throw new Error('KMS signing failed: no signature returned');
  }

  return {
    signature: Buffer.from(response.Signature).toString('base64'),
    keyId: response.KeyId || keyId,
    algorithm,
  };
}

// Get public key for verification (can be exposed to public API)
export async function getPublicKey(
  keyId: string = config.kms.signingKeyId
): Promise<{ publicKey: string; keyId: string }> {
  const command = new GetPublicKeyCommand({
    KeyId: keyId,
  });

  const response = await kmsClient.send(command);

  if (!response.PublicKey) {
    throw new Error('Failed to retrieve public key');
  }

  return {
    publicKey: Buffer.from(response.PublicKey).toString('base64'),
    keyId: response.KeyId || keyId,
  };
}
