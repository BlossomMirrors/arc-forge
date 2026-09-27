import { json } from '@sveltejs/kit';
import { authenticateRunner } from '$lib/server/runners/tokens';
import { handleHeartbeat, type HeartbeatPayload } from '$lib/server/runners/heartbeat';
import { badRequest, readJson } from '$lib/server/runners/request';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const runner = await authenticateRunner(event);
	if (runner instanceof Response) return runner;

	const payload = await readJson<HeartbeatPayload>(event.request);
	if (!payload) return badRequest('Invalid heartbeat');

	return json(await handleHeartbeat(runner, payload));
};
