import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { canMoveBetweenProfiles, canDeleteListing } from '$lib/server/developer-profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const { activeDeveloperProfileId, developerProfiles } = await parent();

	const lists =
		!staff && !activeDeveloperProfileId
			? []
			: await db.appList.findMany({
					where: staff ? undefined : { developerProfileId: activeDeveloperProfileId },
					include: {
						_count: { select: { items: true } },
						developerProfile: { select: { name: true } }
					},
					orderBy: { createdAt: 'desc' }
				});

	const eligibleProfiles = staff
		? await db.developerProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
		: developerProfiles
				.filter((p) => p.role !== 'member')
				.map((p) => ({ id: p.id, name: p.name }));

	return {
		lists,
		isStaff: staff,
		activeDeveloperProfileId,
		eligibleProfiles
	};
};

export const actions: Actions = {
	// No developer profile required to create one, this is a personal curation
	// feature, not a submission, anyone signed in can make one. It's still
	// filed under whichever profile is active though, so it shows up in the
	// right tab right away.
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const list = await db.appList.create({
			data: {
				name,
				createdById: locals.user.id,
				developerProfileId: locals.session?.activeOrganizationId ?? null
			}
		});
		throw redirect(303, `/dashboard/lists/${list.id}`);
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const list = await db.appList.findUnique({ where: { id } });
		if (!list) return fail(404);
		if (!(await canDeleteListing(locals.user.id, isStaff(locals.user), list.createdById, list.developerProfileId))) {
			throw error(403, 'You can only delete your own lists');
		}

		await db.appList.delete({ where: { id } });
	},

	moveToProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		const developerProfileId = data.get('developerProfileId') as string;
		if (!id || !developerProfileId) return fail(400);

		const list = await db.appList.findUnique({ where: { id } });
		if (!list) return fail(404);

		const profile = await canMoveBetweenProfiles(
			locals.user.id,
			isStaff(locals.user),
			list.developerProfileId,
			developerProfileId
		);
		if (!profile) {
			throw error(403, 'You do not have permission to move this list to that developer profile');
		}

		await db.appList.update({ where: { id }, data: { developerProfileId } });
	}
};
