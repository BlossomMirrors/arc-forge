import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { canMoveBetweenProfiles, canDeleteListing } from '$lib/server/developer-profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const { activeDeveloperProfileId, developerProfiles } = await parent();

	const apps =
		!staff && !activeDeveloperProfileId
			? []
			: await db.pwaApp.findMany({
					where: staff ? undefined : { developerProfileId: activeDeveloperProfileId },
					include: { developerProfile: { select: { name: true } } },
					orderBy: { createdAt: 'asc' }
				});

	const eligibleProfiles = staff
		? await db.developerProfile.findMany({
				select: { id: true, name: true },
				orderBy: { name: 'asc' }
			})
		: developerProfiles.filter((p) => p.role !== 'member').map((p) => ({ id: p.id, name: p.name }));

	return {
		apps,
		isStaff: staff,
		activeDeveloperProfileId,
		eligibleProfiles
	};
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) return fail(404);
		if (
			!(await canDeleteListing(
				locals.user.id,
				isStaff(locals.user),
				app.submittedById,
				app.developerProfileId
			))
		) {
			throw error(403, 'You can only delete your own submissions');
		}
		await db.pwaApp.delete({ where: { id } });
	},

	moveToProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		const developerProfileId = data.get('developerProfileId') as string;
		if (!id || !developerProfileId) return fail(400);

		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) return fail(404);

		const profile = await canMoveBetweenProfiles(
			locals.user.id,
			isStaff(locals.user),
			app.developerProfileId,
			developerProfileId
		);
		if (!profile) {
			throw error(403, 'You do not have permission to move this PWA to that developer profile');
		}

		await db.pwaApp.update({ where: { id }, data: { developerProfileId } });
	}
};
