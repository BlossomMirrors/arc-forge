import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import { notifyUser } from '$lib/server/notifications';
import { PAGE_SIZE, pageCount, parsePage } from '$lib/server/pagination';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireReviewer(locals.user);

	const page = parsePage(url, 'page');

	const [pendingScreenshots, pendingTotal] = await Promise.all([
		db.screenshotSubmission.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			include: { submittedBy: { select: { name: true, email: true } } }
		}),
		db.screenshotSubmission.count({ where: { status: 'PENDING' } })
	]);

	return {
		pendingScreenshots,
		page,
		totalPages: pageCount(pendingTotal)
	};
};

export const actions: Actions = {
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
