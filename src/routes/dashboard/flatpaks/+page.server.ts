import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { canMoveBetweenProfiles } from '$lib/server/developer-profile';
import { unpublishFlatpak } from '$lib/server/flatpak-publish';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const { activeDeveloperProfileId, developerProfiles } = await parent();

	const apps =
		!staff && !activeDeveloperProfileId
			? []
			: await db.flatpakApp.findMany({
					where: staff ? undefined : { developerProfileId: activeDeveloperProfileId },
					include: { developerProfile: { select: { name: true } } },
					orderBy: { createdAt: 'asc' }
				});

	const eligibleProfiles = staff
		? await db.developerProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
		: developerProfiles
				.filter((p) => p.role !== 'member')
				.map((p) => ({ id: p.id, name: p.name }));

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

		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) return fail(404);
		if (!isStaff(locals.user) && app.submittedById !== locals.user.id) {
			throw error(403, 'You can only delete your own submissions');
		}
		if (app.status === 'PROCESSING') {
			return fail(409, { error: 'A build is currently in progress for this app' });
		}

		// If it's currently live, it has to come off the repo first, deleting the
		// Forge record must not leave an orphaned, unmanaged app published on the repo.
		if (app.status === 'APPROVED') {
			const { ok, log } = await unpublishFlatpak(app);
			if (!ok) return fail(500, { error: 'Could not remove from the repo', log });
		}

		await db.flatpakApp.delete({ where: { id } });
	},

	moveToProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		const developerProfileId = data.get('developerProfileId') as string;
		if (!id || !developerProfileId) return fail(400);

		const app = await db.flatpakApp.findUnique({ where: { id } });
		if (!app) return fail(404);

		const profile = await canMoveBetweenProfiles(
			locals.user.id,
			isStaff(locals.user),
			app.developerProfileId,
			developerProfileId
		);
		if (!profile) {
			throw error(403, 'You do not have permission to move this Flatpak to that developer profile');
		}

		await db.flatpakApp.update({ where: { id }, data: { developerProfileId } });
	}
};
