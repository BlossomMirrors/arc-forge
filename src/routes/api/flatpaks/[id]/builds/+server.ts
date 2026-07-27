import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isReviewer } from '$lib/server/authz';
import type { RequestHandler } from './$types';

// Last-10 build history summaries for one app (see FlatpakBuild's cap in
// triggerPublish), deliberately without the `log` body so this stays cheap to
// load eagerly - flatpak-build-history.svelte fetches an individual build's
// full log on demand via /api/flatpak-builds/[id] instead.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const app = await db.flatpakApp.findUnique({
		where: { id: params.id },
		select: { submittedById: true }
	});
	if (!app) throw error(404, 'Flatpak not found');
	if (!isReviewer(locals.user) && app.submittedById !== locals.user.id) {
		throw error(403, 'You can only view builds for your own submissions');
	}

	const builds = await db.flatpakBuild.findMany({
		where: { flatpakAppId: params.id },
		orderBy: { startedAt: 'desc' },
		take: 10,
		select: {
			id: true,
			status: true,
			gitCommit: true,
			startedAt: true,
			finishedAt: true,
			triggeredBy: { select: { name: true } }
		}
	});

	return Response.json({
		builds: builds.map((b) => ({
			id: b.id,
			status: b.status,
			gitCommit: b.gitCommit,
			triggeredBy: b.triggeredBy?.name ?? null,
			startedAt: b.startedAt,
			finishedAt: b.finishedAt
		}))
	});
};
