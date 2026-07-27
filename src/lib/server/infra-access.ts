import { createHash, randomInt } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { sendEmail, renderNotificationEmail } from './email';

// How long a code stays enterable after being requested.
const CODE_TTL_MS = 10 * 60 * 1000;
// How long access stays granted after a code is successfully verified.
export const ACCESS_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

export function infraAccessExpiresAt(verifiedAt: Date): Date {
	return new Date(verifiedAt.getTime() + ACCESS_TTL_MS);
}

export async function isInfraAccessVerified(sessionId: string): Promise<boolean> {
	const record = await db.infraAccessVerification.findUnique({ where: { sessionId } });
	if (!record?.verifiedAt) return false;
	return infraAccessExpiresAt(record.verifiedAt).getTime() > Date.now();
}

// Actions are reachable directly by POSTing to their URL without ever running the
// page's load function (same reasoning as requireReviewer/requireAdmin in authz.ts),
// so every mutating infra action must re-check this itself rather than trusting that
// the page only rendered the form once verified.
export async function requireVerifiedInfraAccess(sessionId: string): Promise<void> {
	if (!(await isInfraAccessVerified(sessionId))) {
		throw error(403, 'Infra access verification required');
	}
}

export async function requestInfraAccessCode(sessionId: string, email: string): Promise<void> {
	const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

	await db.infraAccessVerification.upsert({
		where: { sessionId },
		update: {
			codeHash: hashCode(code),
			codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
			attempts: 0,
			verifiedAt: null
		},
		create: {
			sessionId,
			codeHash: hashCode(code),
			codeExpiresAt: new Date(Date.now() + CODE_TTL_MS)
		}
	});

	await sendEmail({
		to: email,
		subject: 'Your Arc Forge infra access code',
		html: renderNotificationEmail({
			title: 'Infra access code',
			body: `Your code is ${code}. It expires in 10 minutes and grants access to Infra Settings for 5 minutes once entered. If you didn't request this, you can ignore this email.`
		})
	});
}

export async function verifyInfraAccessCode(
	sessionId: string,
	code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const record = await db.infraAccessVerification.findUnique({ where: { sessionId } });
	if (!record) return { ok: false, error: 'Request a code first' };
	if (record.attempts >= MAX_ATTEMPTS) {
		return { ok: false, error: 'Too many incorrect attempts, request a new code' };
	}
	if (record.codeExpiresAt.getTime() < Date.now()) {
		return { ok: false, error: 'Code expired, request a new one' };
	}
	if (hashCode(code.trim()) !== record.codeHash) {
		await db.infraAccessVerification.update({
			where: { sessionId },
			data: { attempts: { increment: 1 } }
		});
		return { ok: false, error: 'Incorrect code' };
	}

	await db.infraAccessVerification.update({
		where: { sessionId },
		data: { verifiedAt: new Date() }
	});
	return { ok: true };
}

// Lets an admin drop their own elevated access before the 5 minute window naturally
// expires, e.g. before stepping away from their machine. deleteMany (not delete) so
// this is a no-op instead of throwing if there's nothing to clear.
export async function signOutInfraAccess(sessionId: string): Promise<void> {
	await db.infraAccessVerification.deleteMany({ where: { sessionId } });
}
