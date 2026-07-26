import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const lists = await db.appList.findMany({
		where: { createdById: locals.user.id },
		include: { _count: { select: { items: true } } },
		orderBy: { createdAt: 'desc' }
	});
	return { lists };
};

export const actions: Actions = {
	// No developer profile required to create one, this is a personal curation
	// feature, not a submission - anyone signed in can make one.
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const list = await db.appList.create({
			data: { name, createdById: locals.user.id }
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
		if (list.createdById !== locals.user.id) {
			throw error(403, 'You can only delete your own lists');
		}

		await db.appList.delete({ where: { id } });
	}
};
