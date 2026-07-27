import { db } from '$lib/server/db';
import { requireStaff } from '$lib/server/authz';
import type { Section } from '$lib/frontpage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireStaff(locals.user);
	const row = await db.frontPage.findUnique({ where: { id: 'singleton' } });
	const sections = (row?.sections ?? []) as Section[];

	// Anyone can make a list, there could be far too many to load them all up
	// front for a picker - only resolve the ones already referenced here, the
	// designer's list block otherwise searches for others on demand.
	const listRefs = sections
		.filter((s): s is Extract<Section, { type: 'list' }> => s.type === 'list')
		.map((s) => s.listRef)
		.filter(Boolean);

	const lists = listRefs.length
		? await db.appList.findMany({
				where: { OR: [{ id: { in: listRefs } }, { slug: { in: listRefs } }] },
				select: {
					id: true,
					slug: true,
					name: true,
					icon: true,
					_count: { select: { items: true } }
				}
			})
		: [];

	return { sections, lists };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		requireStaff(locals.user);
		const data = await request.formData();
		const raw = data.get('sections') as string;
		const sections = JSON.parse(raw);
		await db.frontPage.upsert({
			where: { id: 'singleton' },
			update: { sections },
			create: { id: 'singleton', sections }
		});
	}
};
