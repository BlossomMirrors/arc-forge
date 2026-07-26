import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import { triggerPublish, unpublishFlatpak } from '$lib/server/flatpak-publish';
import { notifyUser } from '$lib/server/notifications';
import {
	approveDeveloperVerification,
	rejectDeveloperVerification
} from '$lib/server/developer-verification';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireReviewer(locals.user);
	const [
		pending,
		recentlyReviewed,
		pendingFlatpaks,
		recentFlatpaks,
		pendingVerifications,
		pendingScreenshots
	] = await Promise.all([
		db.pwaApp.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } }
		}),
		db.pwaApp.findMany({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } },
			orderBy: { reviewedAt: 'desc' },
			take: 20,
			include: {
				submittedBy: { select: { name: true, email: true } },
				reviewedBy: { select: { name: true, email: true } }
			}
		}),
		db.flatpakApp.findMany({
			where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } }
		}),
		db.flatpakApp.findMany({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } },
			orderBy: { reviewedAt: 'desc' },
			take: 20,
			include: {
				submittedBy: { select: { name: true, email: true } },
				reviewedBy: { select: { name: true, email: true } }
			}
		}),
		db.developerVerificationRequest.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			include: {
				developerProfile: { select: { name: true, slug: true } },
				requestedBy: { select: { name: true, email: true } }
			}
		}),
		db.screenshotSubmission.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } }
		})
	]);
	return {
		pending,
		recentlyReviewed,
		pendingFlatpaks,
		recentFlatpaks,
		pendingVerifications,
		pendingScreenshots
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);
		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'PWA not found');

		await db.pwaApp.update({
			where: { id },
			data: {
				status: 'APPROVED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: null
			}
		});
		if (app.submittedById) {
			await notifyUser(app.submittedById, {
				type: 'pwa_approved',
				title: `${app.name} was approved`,
				link: `/dashboard/pwas/${app.id}`
			});
		}
	},

	reject: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'PWA not found');

		await db.pwaApp.update({
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
				type: 'pwa_rejected',
				title: `${app.name} was rejected`,
				body: note || undefined,
				link: `/dashboard/pwas/${app.id}`
			});
		}
	},

	// Reviewer-only: takes an already-approved PWA off the public feed while keeping
	// the submission record, so it can be re-approved later without resubmitting.
	pullPwa: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) throw error(404, 'PWA not found');
		if (app.status !== 'APPROVED') return fail(400, { error: 'Only approved apps can be pulled' });

		await db.pwaApp.update({
			where: { id },
			data: {
				status: 'PULLED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null
			}
		});
		if (app.submittedById) {
			await notifyUser(app.submittedById, {
				type: 'pwa_pulled',
				title: `${app.name} was pulled from the store`,
				body: note || undefined,
				link: `/dashboard/pwas/${app.id}`
			});
		}
	},

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
				buildLog: null,
				buildStartedAt: new Date(),
				buildFinishedAt: null
			}
		});
		triggerPublish(id);
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

	// Re-runs the same pipeline for a FAILED build (or a PROCESSING one stuck after
	// a server restart/crash) without requiring the submitter to edit anything first.
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
				buildLog: null,
				buildStartedAt: new Date(),
				buildFinishedAt: null
			}
		});
		triggerPublish(id);
	},

	approveVerification: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const result = await approveDeveloperVerification(id, reviewer.id);
		if (!result.ok) return fail(400, { error: result.error });
	},

	rejectVerification: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);

		const result = await rejectDeveloperVerification(id, reviewer.id, note);
		if (!result.ok) return fail(400, { error: result.error });
	},

	approveScreenshot: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);
		const submission = await db.screenshotSubmission.findUnique({ where: { id } });
		if (!submission) throw error(404, 'Screenshot not found');

		await db.screenshotSubmission.update({
			where: { id },
			data: {
				status: 'APPROVED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: null
			}
		});
		if (submission.submittedById) {
			await notifyUser(submission.submittedById, {
				type: 'screenshot_approved',
				title: `Your screenshot was approved`,
				link: `/dashboard/screenshots`
			});
		}
	},

	rejectScreenshot: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const submission = await db.screenshotSubmission.findUnique({ where: { id } });
		if (!submission) throw error(404, 'Screenshot not found');

		await db.screenshotSubmission.update({
			where: { id },
			data: {
				status: 'REJECTED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null
			}
		});
		if (submission.submittedById) {
			await notifyUser(submission.submittedById, {
				type: 'screenshot_rejected',
				title: `Your screenshot was rejected`,
				body: note || undefined,
				link: `/dashboard/screenshots`
			});
		}
	}
};
