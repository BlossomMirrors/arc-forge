import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GET: RequestHandler = async ({ request, locals }) => {
	const signOutResponse = await auth.api.signOut({
		headers: request.headers,
		asResponse: true
	});

	const headers = new Headers({
		Location: '/auth/login'
	});
	for (const cookie of signOutResponse.headers.getSetCookie?.() ?? []) {
		headers.append('set-cookie', cookie);
	}
	return new Response(null, { status: 302, headers });
};
