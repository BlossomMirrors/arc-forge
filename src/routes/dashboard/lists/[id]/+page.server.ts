import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { slugify } from '$lib/slug';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401);
	const list = await db.appList.findUnique({
		where: { id: params.id },
		include: { items: { orderBy: { position: 'asc' } } }
	});
	if (!list) throw error(404, 'List not found');
	if (!isStaff(locals.user) && list.createdById !== locals.user.id) {
		throw error(403, 'You can only edit your own lists');
	}
	return { list };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const list = await db.appList.findUnique({ where: { id: params.id } });
		if (!list) return fail(404);
		if (!isStaff(locals.user) && list.createdById !== locals.user.id) throw error(403);

		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		const icon = ((data.get('icon') as string) ?? '').trim();
		const description = ((data.get('description') as string) ?? '').trim();
		const rawSlug = ((data.get('slug') as string) ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const slug = rawSlug ? slugify(rawSlug) : null;
		if (rawSlug && !slug) return fail(400, { error: 'Could not derive a slug from that value' });

		if (slug) {
			const slugTaken = await db.appList.findFirst({ where: { slug, NOT: { id: params.id } } });
			if (slugTaken) return fail(400, { error: 'That slug is already taken' });
		}

		await db.appList.update({
			where: { id: params.id },
			data: { name, icon: icon || null, description: description || null, slug }
		});
	},

	addItem: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const list = await db.appList.findUnique({ where: { id: params.id } });
		if (!list) return fail(404);
		if (!isStaff(locals.user) && list.createdById !== locals.user.id) throw error(403);

		const data = await request.formData();
		const ref = ((data.get('ref') as string) ?? '').trim();
		const name = ((data.get('name') as string) ?? '').trim();
		const iconUrl = ((data.get('iconUrl') as string) ?? '').trim();
		if (!ref || !name) return fail(400, { error: 'Missing app reference' });

		const existing = await db.appListItem.findFirst({ where: { listId: params.id, appRef: ref } });
		if (existing) return fail(400, { error: 'That app is already on this list' });

		const last = await db.appListItem.findFirst({
			where: { listId: params.id },
			orderBy: { position: 'desc' }
		});

		await db.appListItem.create({
			data: {
				listId: params.id,
				appRef: ref,
				name,
				iconUrl: iconUrl || null,
				position: (last?.position ?? -1) + 1
			}
		});
	},

	removeItem: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const list = await db.appList.findUnique({ where: { id: params.id } });
		if (!list) return fail(404);
		if (!isStaff(locals.user) && list.createdById !== locals.user.id) throw error(403);

		const data = await request.formData();
		const itemId = data.get('itemId') as string;
		if (!itemId) return fail(400);

		await db.appListItem.deleteMany({ where: { id: itemId, listId: params.id } });
	},

	reorder: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const list = await db.appList.findUnique({ where: { id: params.id } });
		if (!list) return fail(404);
		if (!isStaff(locals.user) && list.createdById !== locals.user.id) throw error(403);

		const data = await request.formData();
		const order = data.getAll('itemId') as string[];
		if (!order.length) return fail(400);

		await db.$transaction(
			order.map((itemId, position) =>
				db.appListItem.updateMany({
					where: { id: itemId, listId: params.id },
					data: { position }
				})
			)
		);
	}
};
