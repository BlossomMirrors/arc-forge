import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { canMoveBetweenProfiles, canDeleteListing } from '$lib/server/developer-profile';
import { notifyReviewers } from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const { activeDeveloperProfileId, developerProfiles } = await parent();

	const submissions =
		!staff && !activeDeveloperProfileId
			? []
			: await db.screenshotSubmission.findMany({
					where: staff ? undefined : { developerProfileId: activeDeveloperProfileId },
					include: { developerProfile: { select: { name: true } } },
					orderBy: { createdAt: 'desc' }
				});

	const eligibleProfiles = staff
		? await db.developerProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
		: developerProfiles
				.filter((p) => p.role !== 'member')
				.map((p) => ({ id: p.id, name: p.name }));

	return {
		submissions,
		isStaff: staff,
		activeDeveloperProfileId,
		eligibleProfiles
	};
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
				developerProfileId: locals.session?.activeOrganizationId ?? null,
				status: staff ? 'APPROVED' : 'PENDING'
			}
		});

		if (!staff) {
			await notifyReviewers({
				type: 'screenshot_pending',
				title: `New screenshot submitted for review`,
				link: `/dashboard/review/screenshots`
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
		if (
			!(await canDeleteListing(
				locals.user.id,
				isStaff(locals.user),
				submission.submittedById,
				submission.developerProfileId
			))
		) {
			throw error(403, 'You can only delete your own submissions');
		}

		await db.screenshotSubmission.delete({ where: { id } });
	},

	moveToProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		const developerProfileId = data.get('developerProfileId') as string;
		if (!id || !developerProfileId) return fail(400);

		const submission = await db.screenshotSubmission.findUnique({ where: { id } });
		if (!submission) return fail(404);

		const profile = await canMoveBetweenProfiles(
			locals.user.id,
			isStaff(locals.user),
			submission.developerProfileId,
			developerProfileId
		);
		if (!profile) {
			throw error(403, 'You do not have permission to move this screenshot to that developer profile');
		}

		await db.screenshotSubmission.update({ where: { id }, data: { developerProfileId } });
	}
};
