import { authenticateRunner } from '$lib/server/runners/tokens';
import { appendJobLog, loadActiveJob } from '$lib/server/runners/jobs';
import { badRequest, readJson } from '$lib/server/runners/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;
	const job = await loadActiveJob(runner, event.params.id);
	if (job instanceof Response) return job;

	const payload = await readJson<{ offset?: unknown; text?: unknown }>(event.request);
	const offset = Number(payload?.offset);
	if (!payload || typeof payload.text !== 'string' || !Number.isInteger(offset) || offset < 0) {
		return badRequest('Invalid log chunk');
	}
	return appendJobLog(job, offset, payload.text);
};
