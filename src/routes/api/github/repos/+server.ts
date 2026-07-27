import { getGithubAccessToken, listUserRepos } from '$lib/server/github';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const accessToken = await getGithubAccessToken(locals.user.id);
	if (!accessToken) return Response.json({ repos: [] });

	const repos = await listUserRepos(accessToken);
	return Response.json({ repos });
};
