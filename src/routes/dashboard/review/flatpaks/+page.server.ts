import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import { triggerPublish, unpublishFlatpak } from '$lib/server/flatpak-publish';
import { notifyUser } from '$lib/server/notifications';
import { PAGE_SIZE, pageCount, parsePage } from '$lib/server/pagination';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireReviewer(locals.user);

	const page = parsePage(url, 'page');
	const processingPage = parsePage(url, 'processingPage');
	const reviewedPage = parsePage(url, 'reviewedPage');
	const failedPage = parsePage(url, 'failedPage');

	const [
		pendingFlatpaks,
		pendingTotal,
		processingFlatpaks,
		processingTotal,
		recentFlatpaks,
		recentTotal,
		failedFlatpaks,
		failedTotal
	] = await Promise.all([
		db.flatpakApp.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.flatpakApp.count({ where: { status: 'PENDING' } }),
		db.flatpakApp.findMany({
			where: { status: 'PROCESSING' },
			orderBy: { buildStartedAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } },
			skip: (processingPage - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.flatpakApp.count({ where: { status: 'PROCESSING' } }),
		db.flatpakApp.findMany({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } },
			orderBy: { reviewedAt: 'desc' },
			skip: (reviewedPage - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			include: {
				submittedBy: { select: { name: true, email: true } },
				reviewedBy: { select: { name: true, email: true } }
			}
		}),
		db.flatpakApp.count({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } }
		}),
		db.flatpakApp.findMany({
			where: { status: 'FAILED' },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } },
			skip: (failedPage - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.flatpakApp.count({ where: { status: 'FAILED' } })
	]);

	// bundleSize is BigInt in the DB (Postgres integer overflows past ~2.1GB) but stays
	// a plain number everywhere client-side - always well under Number.MAX_SAFE_INTEGER
	// for any realistic bundle, and bigint doesn't mix with the ordinary arithmetic the
	// review UI does on it.
	const withNumericBundleSize = <T extends { bundleSize: bigint | null }>(app: T) => ({
		...app,
		bundleSize: app.bundleSize === null ? null : Number(app.bundleSize)
	});

	return {
		pendingFlatpaks: pendingFlatpaks.map(withNumericBundleSize),
		page,
		totalPages: pageCount(pendingTotal),
		processingFlatpaks: processingFlatpaks.map(withNumericBundleSize),
		processingPage,
		processingTotalPages: pageCount(processingTotal),
		processingCount: processingTotal,
		recentFlatpaks: recentFlatpaks.map(withNumericBundleSize),
		reviewedPage,
		reviewedTotalPages: pageCount(recentTotal),
		failedFlatpaks: failedFlatpaks.map(withNumericBundleSize),
		failedPage,
		failedTotalPages: pageCount(failedTotal),
		failedCount: failedTotal
	};
};

export const actions: Actions = {
	// Unlike PwaApp.approve, this doesn't set APPROVED directly: it flips to
	// PROCESSING and fires the SSH build/publish pipeline in the background.
	// Only a successful build (see flatpak-publish.ts) flips it to APPROVED.
	approveFlatpak: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);
		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'Flatpak not found');
		if (app.status === 'PROCESSING') return fail(409, { error: 'Already processing' });

		await db.flatpakApp.update({
			where: { id },
			data: {
				status: 'PROCESSING',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: null,
				buildStartedAt: new Date(),
				buildFinishedAt: null
			}
		});
		triggerPublish(id, reviewer.id);
	},

	rejectFlatpak: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'Flatpak not found');
		if (app.status === 'PROCESSING') return fail(409, { error: 'Already processing' });

		await db.flatpakApp.update({
			where: { id },
			data: {
				status: 'REJECTED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null
			}
		});
		if (app.submittedById) {
			await notifyUser(app.submittedById, {
				type: 'flatpak_rejected',
				title: `${app.name} was rejected`,
				body: note || undefined,
				link: `/dashboard/flatpaks/${app.id}`
			});
		}
	},

	// Reviewer-only: removes an already-published app's ref from the repo (see
	// unpublishFlatpak), and only marks it PULLED once that actually succeeds,
	// a failed repo removal must not leave Forge thinking it's unpublished when it
	// isn't. Synchronous like the Infra Settings repair action, not fire-and-forget:
	// this is a single deliberate reviewer action, not a per-submission background job.
	pullFlatpak: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'Flatpak not found');
		if (app.status !== 'APPROVED') return fail(400, { error: 'Only approved apps can be pulled' });

		const { ok, log } = await unpublishFlatpak(app);
		if (!ok) return fail(500, { error: 'Failed to remove from the repo', log });

		await db.flatpakApp.update({
			where: { id },
			data: {
				status: 'PULLED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null,
				buildLog: log
			}
		});
		if (app.submittedById) {
			await notifyUser(app.submittedById, {
				type: 'flatpak_pulled',
				title: `${app.name} was pulled from the store`,
				body: note || undefined,
				link: `/dashboard/flatpaks/${app.id}`
			});
		}
	},

	// Re-runs the same pipeline, without requiring the submitter to edit
	// anything first - "Retry build" for a FAILED row, or "Rebuild" for an
	// already-APPROVED one (e.g. to pick up a Forge-side pipeline fix, like
	// improved icon extraction, without waiting for a new upstream commit).
	// No status check: both call sites are equally valid uses. A PROCESSING
	// row left behind by a crash/restart doesn't need this - see
	// reconcileStuckBuilds in flatpak-publish.ts, which picks those back up
	// automatically.
	retryFlatpak: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);
		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'Flatpak not found');

		await db.flatpakApp.update({
			where: { id },
			data: {
				status: 'PROCESSING',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				buildStartedAt: new Date(),
				buildFinishedAt: null
			}
		});
		triggerPublish(id, reviewer.id);
	}
};
