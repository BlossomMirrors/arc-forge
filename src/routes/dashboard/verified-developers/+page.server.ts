import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
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
	return { profiles };
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
	}
};
