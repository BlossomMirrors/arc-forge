import { createHash, randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '../db';
import type { Runner } from '$lib/generated/prisma/client';

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function generateRunnerToken(): { token: string; hash: string; hint: string } {
	const token = `frt_${randomBytes(32).toString('base64url')}`;
	return { token, hash: hashToken(token), hint: token.slice(-4) };
}

function clientAddress(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}

export async function authenticateRunner(event: RequestEvent): Promise<Runner | Response> {
	const header = event.request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	if (!token) return new Response('Unauthorized', { status: 401 });

	const runner = await db.runner.findUnique({ where: { tokenHash: hashToken(token) } });
	if (!runner) return new Response('Unauthorized', { status: 401 });

	return db.runner.update({
		where: { id: runner.id },
		data: { lastSeenAt: new Date(), lastIp: clientAddress(event) ?? runner.lastIp }
	});
}
