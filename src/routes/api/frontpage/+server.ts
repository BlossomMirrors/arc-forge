import { db } from '$lib/server/db';
import { sectionsToXml, type Section } from '$lib/frontpage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const row = await db.frontPage.findUnique({ where: { id: 'singleton' } });
	const sections = ((row?.sections as unknown[]) ?? []) as Section[];

	const listRefs = sections
		.filter((s): s is Extract<Section, { type: 'list' }> => s.type === 'list')
		.map((s) => s.listRef)
		.filter(Boolean);

	const listApps = new Map<string, string[]>();
	if (listRefs.length > 0) {
		const lists = await db.appList.findMany({
			where: { OR: [{ id: { in: listRefs } }, { slug: { in: listRefs } }] },
			include: { items: { orderBy: { position: 'asc' } } }
		});
		for (const list of lists) {
			const refs = list.items.map((item) => item.appRef);
			listApps.set(list.id, refs);
			if (list.slug) listApps.set(list.slug, refs);
		}
	}

	return new Response(sectionsToXml(sections, listApps), {
		headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' }
	});
};
