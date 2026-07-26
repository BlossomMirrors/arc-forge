import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const apps = await db.pwaApp.findMany({
		where: isStaff(locals.user) ? undefined : { submittedById: locals.user.id },
		orderBy: { createdAt: 'asc' }
	});
	return { apps, isStaff: isStaff(locals.user) };
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const app = await db.pwaApp.findUnique({ where: { id } });
		if (!app) return fail(404);
		if (!isStaff(locals.user) && app.submittedById !== locals.user.id) {
			throw error(403, 'You can only delete your own submissions');
		}
		await db.pwaApp.delete({ where: { id } });
	}
};
