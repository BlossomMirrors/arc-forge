import { authenticateRunner } from '$lib/server/runners/tokens';
import { completeJob, loadActiveJob, type CompletePayload } from '$lib/server/runners/jobs';
import { badRequest, readJson } from '$lib/server/runners/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;
	const job = await loadActiveJob(runner, event.params.id);
	if (job instanceof Response) return job;

	const payload = await readJson<CompletePayload>(event.request);
	if (!payload) return badRequest('Invalid completion report');
	return completeJob(job, payload);
};
