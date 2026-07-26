import { searchApps } from '$lib/server/app-lists';
import type { RequestHandler } from './$types';

// Used by the list-builder's search box (see dashboard/lists/[id]) - kept
// server-mediated rather than calling arpi.blossomos.org straight from the
// browser, same reasoning as every other proxy endpoint in this app.
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const q = url.searchParams.get('q') ?? '';
	const results = await searchApps(q);
	return Response.json({ results });
};
