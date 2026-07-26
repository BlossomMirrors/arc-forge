import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Not a form action, called from the avatar dropdown in the shared dashboard layout,
// which (like the notification center and developer-profile switcher) can't define
// actions since it has no +page.server.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const emailNotificationsEnabled = (body as Record<string, unknown>)?.emailNotificationsEnabled;
	if (typeof emailNotificationsEnabled !== 'boolean') {
		return new Response('Bad Request', { status: 400 });
	}

	await db.user.update({
		where: { id: locals.user.id },
		data: { emailNotificationsEnabled }
	});
	return Response.json({ ok: true });
};
