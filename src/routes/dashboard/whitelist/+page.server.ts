import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireStaff } from '$lib/server/authz';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireStaff(locals.user);
	const entries = await db.whitelistEntry.findMany({ orderBy: { createdAt: 'asc' } });
	return { entries };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireStaff(locals.user);
		const data = await request.formData();
		const value = (data.get('value') as string)?.trim();
		if (!value) return fail(400, { error: 'Value is required' });
		await db.whitelistEntry.upsert({ where: { value }, update: {}, create: { value } });
	},

	remove: async ({ request, locals }) => {
		requireStaff(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400, { error: 'ID is required' });
		await db.whitelistEntry.delete({ where: { id } });
	}
};
