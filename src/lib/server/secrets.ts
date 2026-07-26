import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// FORGE_SECRETS_KEY can be any length; hashed down to a stable 32-byte AES key
// rather than requiring an exact-length value.
function getKey(): Buffer {
	const secret = env.FORGE_SECRETS_KEY;
	if (!secret) throw new Error('FORGE_SECRETS_KEY is not configured');
	return createHash('sha256').update(secret).digest();
}

// Encodes iv + authTag + ciphertext as a single base64 string so each
// encrypted field is one column value.
export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(blob: string): string {
	const raw = Buffer.from(blob, 'base64');
	const iv = raw.subarray(0, IV_LENGTH);
	const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
