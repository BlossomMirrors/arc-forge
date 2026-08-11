import { db } from '$lib/server/db';
import { renderFlatpakRepoFile } from '$lib/server/flatpak-repo-file';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	const body = await renderFlatpakRepoFile(url.origin, settings);

	return new Response(body, {
		headers: {
			'content-type': 'application/vnd.flatpak.repo',
			'cache-control': 'no-cache'
		}
	});
};
