import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { notifyReviewers } from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const submissions = await db.screenshotSubmission.findMany({
		where: isStaff(locals.user) ? undefined : { submittedById: locals.user.id },
		orderBy: { createdAt: 'desc' }
	});
	return { submissions, isStaff: isStaff(locals.user) };
};

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const url = ((data.get('url') as string) ?? '').trim();
		const mimeType = ((data.get('mimeType') as string) ?? '').trim();
		const fileName = ((data.get('fileName') as string) ?? '').trim();
		const fileSize = Number(data.get('fileSize') ?? 0);
		if (!url || !mimeType) return fail(400, { error: 'Upload a screenshot first' });

		const staff = isStaff(locals.user);
		const submission = await db.screenshotSubmission.create({
			data: {
				url,
				mimeType,
				fileName,
				fileSize,
				submittedById: locals.user.id,
				status: staff ? 'APPROVED' : 'PENDING'
			}
		});

		if (!staff) {
			await notifyReviewers({
				type: 'screenshot_pending',
				title: `New screenshot submitted for review`,
				link: `/dashboard/review`
			});
		}
		return { submission };
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const submission = await db.screenshotSubmission.findUnique({ where: { id } });
		if (!submission) return fail(404);
		if (!isStaff(locals.user) && submission.submittedById !== locals.user.id) {
			throw error(403, 'You can only delete your own submissions');
		}

		await db.screenshotSubmission.delete({ where: { id } });
	}
};
