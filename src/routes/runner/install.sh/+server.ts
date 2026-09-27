import { renderInstallScript } from '$lib/server/runners/install-script';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(renderInstallScript(), {
		headers: {
			'Content-Type': 'text/x-shellscript; charset=utf-8',
			'Cache-Control': 'no-cache'
		}
	});
