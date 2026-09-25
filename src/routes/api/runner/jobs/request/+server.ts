import { json } from '@sveltejs/kit';
import { authenticateRunner } from '$lib/server/runners/tokens';
import { claimJob } from '$lib/server/runners/queue';
import { isRunnerArch } from '$lib/server/runners/status';
import { badRequest, readJson } from '$lib/server/runners/request';
import type { RequestHandler } from './$types';

const LONG_POLL_MS = 25_000;
const POLL_STEP_MS = 2_000;

export const POST: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;

	const payload = await readJson<{ arch?: unknown }>(event.request);
	if (!payload || !isRunnerArch(payload.arch)) return badRequest('Unsupported architecture');

	const deadline = Date.now() + LONG_POLL_MS;
	while (!event.request.signal.aborted) {
		const job = await claimJob(runner, payload.arch);
		if (job) return json(job);
		if (Date.now() + POLL_STEP_MS > deadline) break;
		await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
	}
	return new Response(null, { status: 204 });
};
