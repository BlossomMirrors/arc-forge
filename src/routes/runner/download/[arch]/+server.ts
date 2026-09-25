import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { runnerBinaryPath } from '$lib/server/runners/dist';
import { isRunnerArch } from '$lib/server/runners/status';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!isRunnerArch(params.arch)) throw error(404, 'Unsupported architecture');
	const path = runnerBinaryPath(params.arch);
	const info = await stat(path).catch(() => null);
	if (!info) throw error(404, 'Runner binary is not available');

	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Length': String(info.size),
			'Content-Disposition': `attachment; filename="forge-runner-${params.arch}"`,
			'Cache-Control': 'no-cache'
		}
	});
};
