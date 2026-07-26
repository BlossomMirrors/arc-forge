import { APIError } from 'better-auth';
import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

// Not a form action, called from the nav-menu dropdown in the shared dashboard layout,
// which (like the notification center) can't define actions since it has no +page.server.ts.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const developerProfileId = (body as Record<string, unknown>)?.developerProfileId;
	if (typeof developerProfileId !== 'string') return new Response('Bad Request', { status: 400 });

	try {
		await auth.api.setActiveOrganization({
			headers: request.headers,
			body: { organizationId: developerProfileId }
		});
	} catch (e) {
		if (e instanceof APIError) {
			return Response.json(
				{ error: e.body?.message ?? 'Could not switch developer profile' },
				{ status: 400 }
			);
		}
		throw e;
	}

	return Response.json({ ok: true });
};
