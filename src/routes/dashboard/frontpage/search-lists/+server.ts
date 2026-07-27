import { db } from '$lib/server/db';
import { requireStaff } from '$lib/server/authz';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	requireStaff(locals.user);
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return Response.json({ results: [] });

	const results = await db.appList.findMany({
		where: {
			OR: [
				{ name: { contains: q, mode: 'insensitive' } },
				{ slug: { contains: q, mode: 'insensitive' } }
			]
		},
		select: { id: true, slug: true, name: true, icon: true, _count: { select: { items: true } } },
		take: 20
	});
	return Response.json({ results });
};
