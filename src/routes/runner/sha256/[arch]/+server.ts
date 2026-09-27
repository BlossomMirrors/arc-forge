import { error } from '@sveltejs/kit';
import { readRunnerManifest } from '$lib/server/runners/dist';
import { isRunnerArch } from '$lib/server/runners/status';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!isRunnerArch(params.arch)) throw error(404, 'Unsupported architecture');
	const sha256 = (await readRunnerManifest())?.arches[params.arch]?.sha256;
	if (!sha256) throw error(404, 'Runner binary is not available');

	return new Response(`${sha256}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }
	});
};
