import { getGithubAccessToken, listRepoBranches } from '$lib/server/github';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const owner = url.searchParams.get('owner');
	const repo = url.searchParams.get('repo');
	if (!owner || !repo) return new Response('Bad Request', { status: 400 });

	const accessToken = await getGithubAccessToken(locals.user.id);
	if (!accessToken) return Response.json({ branches: [] });

	const branches = await listRepoBranches(accessToken, owner, repo);
	return Response.json({ branches });
};
