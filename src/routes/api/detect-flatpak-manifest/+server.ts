import { detectManifestPath } from '$lib/server/git-watch';
import type { RequestHandler } from './$types';

// Best-effort prefill for the manifest path field when submitting a Flatpak from a
// git repo - the submitter still confirms/edits the result themselves (see
// resolveFlatpakSubmission, which independently validates whatever path is
// actually submitted).
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const gitUrl = (body as Record<string, unknown>)?.gitUrl;
	const gitBranch = (body as Record<string, unknown>)?.gitBranch;
	if (typeof gitUrl !== 'string' || typeof gitBranch !== 'string' || !gitUrl || !gitBranch) {
		return new Response('Bad Request', { status: 400 });
	}

	const result = await detectManifestPath(gitUrl, gitBranch);
	return Response.json(result);
};
