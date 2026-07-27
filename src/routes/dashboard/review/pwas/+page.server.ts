import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import { notifyUser } from '$lib/server/notifications';
import { PAGE_SIZE, pageCount, parsePage } from '$lib/server/pagination';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireReviewer(locals.user);

	const page = parsePage(url, 'page');
	const reviewedPage = parsePage(url, 'reviewedPage');

	const [pending, pendingTotal, recentlyReviewed, recentlyReviewedTotal] = await Promise.all([
		db.pwaApp.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			include: { submittedBy: { select: { name: true, email: true } } },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.pwaApp.count({ where: { status: 'PENDING' } }),
		db.pwaApp.findMany({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } },
			orderBy: { reviewedAt: 'desc' },
			skip: (reviewedPage - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			include: {
				submittedBy: { select: { name: true, email: true } },
				reviewedBy: { select: { name: true, email: true } }
			}
		}),
		db.pwaApp.count({
			where: { status: { in: ['APPROVED', 'REJECTED', 'PULLED'] }, reviewedById: { not: null } }
		})
	]);

	return {
		pending,
		page,
		totalPages: pageCount(pendingTotal),
		recentlyReviewed,
		reviewedPage,
		reviewedTotalPages: pageCount(recentlyReviewedTotal)
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
	}
};
