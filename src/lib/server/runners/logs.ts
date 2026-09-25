import { db } from '../db';
import type { RunnerJob } from '$lib/generated/prisma/client';

export const MAX_JOB_LOG_CHARS = 2_000_000;

type JobWithRunner = RunnerJob & { runner: { name: string } | null };

function describe(job: JobWithRunner): string {
	switch (job.status) {
		case 'QUEUED':
			return `waiting for an ${job.arch} runner`;
		case 'RUNNING':
			return `running on ${job.runner?.name ?? 'a runner'}`;
		case 'UPLOADED':
			return 'built, waiting to be signed';
		case 'IMPORTED':
			return 'published';
		case 'FAILED':
			return `failed${job.error ? `: ${job.error}` : ''}`;
		case 'CANCELLED':
			return 'cancelled';
		case 'SKIPPED':
			return `skipped, no ${job.arch} runner is online`;
	}
}

export function trimLog(log: string): string {
	return log.length > MAX_JOB_LOG_CHARS ? log.slice(log.length - MAX_JOB_LOG_CHARS) : log;
}

export async function runnerJobsLog(buildId: string, withImportHeader = true): Promise<string> {
	const jobs = await db.runnerJob.findMany({
		where: { flatpakBuildId: buildId },
		include: { runner: { select: { name: true } } },
		orderBy: { arch: 'desc' }
	});
	if (jobs.length === 0) return '';

	const sections = jobs.map((job) => `==== ${job.arch}: ${describe(job)} ====\n${job.log}`);
	const footer = withImportHeader ? '\n==== Signing and publishing on the Forge ====\n' : '';
	return `${sections.join('\n')}${footer}`;
}

export async function settleRunnerJobs(buildId: string, ok: boolean): Promise<void> {
	await db.runnerJob.updateMany({
		where: { flatpakBuildId: buildId, status: 'UPLOADED' },
		data: { status: ok ? 'IMPORTED' : 'FAILED' }
	});
}
