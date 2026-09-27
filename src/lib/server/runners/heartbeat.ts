import { db } from '../db';
import type { Runner } from '$lib/generated/prisma/client';
import { readRunnerManifest } from './dist';
import { requeueJob } from './queue';
import { isRunnerArch } from './status';

const LOST_JOB_GRACE_MS = 2 * 60 * 1000;
const MAX_FIELD_CHARS = 200;

export type HeartbeatPayload = {
	version?: unknown;
	arch?: unknown;
	hostname?: unknown;
	os?: unknown;
	concurrency?: unknown;
	runningJobIds?: unknown;
};

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_FIELD_CHARS) : null;
}

function runningIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === 'string').slice(0, 256);
}

export async function handleHeartbeat(runner: Runner, payload: HeartbeatPayload) {
	const arch = isRunnerArch(payload.arch) ? payload.arch : runner.arch;
	const concurrency = Number(payload.concurrency);
	await db.runner.update({
		where: { id: runner.id },
		data: {
			arch,
			version: text(payload.version) ?? runner.version,
			hostname: text(payload.hostname) ?? runner.hostname,
			os: text(payload.os) ?? runner.os,
			concurrency:
				Number.isInteger(concurrency) && concurrency > 0 ? concurrency : runner.concurrency
		}
	});

	const running = runningIds(payload.runningJobIds);
	const active = await db.runnerJob.findMany({
		where: { runnerId: runner.id, status: 'RUNNING' }
	});
	const activeIds = new Set(active.map((j) => j.id));
	const cancelJobIds = running.filter((id) => !activeIds.has(id));

	const graceCutoff = Date.now() - LOST_JOB_GRACE_MS;
	for (const job of active) {
		if (!running.includes(job.id) && (job.claimedAt?.getTime() ?? 0) < graceCutoff) {
			await requeueJob(job, 'The runner lost track of this job');
		}
	}

	const manifest = await readRunnerManifest();
	const build = arch && isRunnerArch(arch) ? manifest?.arches[arch] : undefined;
	const update =
		manifest && build && manifest.version !== text(payload.version)
			? { version: manifest.version, sha256: build.sha256 }
			: null;

	return { cancelJobIds, update };
}
