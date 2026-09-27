import { json } from '@sveltejs/kit';
import { authenticateRunner } from '$lib/server/runners/tokens';
import { loadActiveJob, writeJobArtifact } from '$lib/server/runners/jobs';
import { artifactSize } from '$lib/server/runners/artifacts';
import { badRequest } from '$lib/server/runners/request';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;
	const job = await loadActiveJob(runner, event.params.id);
	if (job instanceof Response) return job;

	return json({ size: await artifactSize(job.id) });
};

export const PUT: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;
	const job = await loadActiveJob(runner, event.params.id);
	if (job instanceof Response) return job;

	const offset = Number(event.url.searchParams.get('offset'));
	if (!Number.isSafeInteger(offset) || offset < 0) return badRequest('Invalid offset');

	const chunk = Buffer.from(await event.request.arrayBuffer());
	return writeJobArtifact(job, offset, chunk);
};
