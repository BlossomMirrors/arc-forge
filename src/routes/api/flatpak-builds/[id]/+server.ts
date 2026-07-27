import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isReviewer } from '$lib/server/authz';
import type { RequestHandler } from './$types';

// Polled by flatpak-build-log-viewer.svelte while a build is PROCESSING, and
// fetched once when a reviewer/submitter expands a past build in
// flatpak-build-history.svelte. Gated the same way as the flatpak detail page
// itself: a reviewer can see any build, a submitter only their own app's.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const build = await db.flatpakBuild.findUnique({
		where: { id: params.id },
		include: {
			flatpakApp: { select: { submittedById: true } },
			triggeredBy: { select: { name: true } }
		}
	});
	if (!build) throw error(404, 'Build not found');
	if (!isReviewer(locals.user) && build.flatpakApp.submittedById !== locals.user.id) {
		throw error(403, 'You can only view builds for your own submissions');
	}

	return Response.json({
		id: build.id,
		status: build.status,
		log: build.log,
		gitCommit: build.gitCommit,
		triggeredBy: build.triggeredBy?.name ?? null,
		startedAt: build.startedAt,
		finishedAt: build.finishedAt
	});
};
