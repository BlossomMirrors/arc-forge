import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const list = await db.appList.findUnique({
		where: { id: params.id },
		include: { items: { orderBy: { position: 'asc' } } }
	});
	if (!list) return new Response('Not found', { status: 404 });

	return Response.json({
		id: list.id,
		name: list.name,
		icon: list.icon,
		description: list.description,
		apps: list.items.map((item) => ({
			ref: item.appRef,
			name: item.name,
			icon_url: item.iconUrl
		}))
	});
};
