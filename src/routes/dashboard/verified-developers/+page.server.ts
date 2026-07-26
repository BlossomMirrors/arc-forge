import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer, requireStaff, isStaff } from '$lib/server/authz';
import { deleteDeveloperProfile } from '$lib/server/developer-profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireReviewer(locals.user);
	const profiles = await db.developerProfile.findMany({
		orderBy: { name: 'asc' },
		include: {
			verifiedBy: { select: { name: true, email: true } },
			_count: { select: { members: true, pwaApps: true, flatpakApps: true } }
		}
	});
	return { profiles, isStaff: isStaff(locals.user) };
};

export const actions: Actions = {
	setVerified: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const verified = data.get('verified') === 'true';
		if (!id) return fail(400);

		await db.developerProfile.update({
			where: { id },
			data: { verified, verifiedById: reviewer.id, verifiedAt: new Date() }
		});
	},

	// Staff-only, independent of the reviewer-gated load/setVerified above: deletes a
	// developer profile and every PWA/Flatpak submitted under it, unpublishing any live
	// Flatpaks from the signed repo first (see deleteDeveloperProfile).
	deleteProfile: async ({ request, locals }) => {
		requireStaff(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const result = await deleteDeveloperProfile(id);
		if (!result.ok) return fail(500, { error: result.error, log: result.log });
	}
};
