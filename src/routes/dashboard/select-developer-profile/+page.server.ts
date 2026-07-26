import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '$lib/auth';
import { listMyDeveloperProfiles } from '$lib/server/developer-profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const developerProfiles = await listMyDeveloperProfiles(locals.user.id);

	if (developerProfiles.length === 0) throw redirect(302, '/dashboard');

	// Nothing to choose, just silently activate it and continue, this is the common
	// case (most users belong to at most one developer profile) and matching Google
	// Play's chooser here would just be an extra click for no benefit.
	if (developerProfiles.length === 1) {
		await auth.api.setActiveOrganization({
			headers: request.headers,
			body: { organizationId: developerProfiles[0].id }
		});
		throw redirect(302, '/dashboard');
	}

	return { developerProfiles };
};

export const actions: Actions = {
	select: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		if (!developerProfileId) return fail(400);

		try {
			await auth.api.setActiveOrganization({
				headers: request.headers,
				body: { organizationId: developerProfileId }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not switch developer profile' });
			throw e;
		}

		throw redirect(302, '/dashboard');
	}
};
