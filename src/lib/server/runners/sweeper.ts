import { db } from '../db';
import { runnerJobsLog } from './logs';
import { failJob, requeueJob, skipJob } from './queue';
import { hasOnlineRunner, onlineSince, PRIMARY_ARCH } from './status';

const SWEEP_INTERVAL_MS = 60_000;
const LOG_REFRESH_INTERVAL_MS = 7_000;
const JOB_TIMEOUT_MS = 6 * 60 * 60 * 1000;

let started = false;

async function requeueStaleJobs(): Promise<void> {
	const stale = await db.runnerJob.findMany({
		where: {
			status: 'RUNNING',
			OR: [{ runnerId: null }, { runner: { lastSeenAt: { lt: onlineSince() } } }]
		}
	});
	for (const job of stale) await requeueJob(job, 'The runner went offline');
}

async function failTimedOutJobs(): Promise<void> {
	const timedOut = await db.runnerJob.findMany({
		where: { status: 'RUNNING', claimedAt: { lt: new Date(Date.now() - JOB_TIMEOUT_MS) } }
	});
	for (const job of timedOut)
		await failJob(job, 'The job ran longer than 6 hours and was stopped.');
}

async function skipUnservedArches(): Promise<void> {
	const queued = await db.runnerJob.findMany({
		where: { status: 'QUEUED', arch: { not: PRIMARY_ARCH } }
	});
	const online = new Map<string, boolean>();
	for (const job of queued) {
		if (!online.has(job.arch)) online.set(job.arch, await hasOnlineRunner(job.arch));
		if (!online.get(job.arch)) await skipJob(job);
	}
}

async function refreshLiveLogs(): Promise<void> {
	const builds = await db.flatpakBuild.findMany({
		where: { finishedAt: null, jobs: { some: { status: { in: ['QUEUED', 'RUNNING'] } } } },
		select: { id: true }
	});
	for (const build of builds) {
		await db.flatpakBuild.update({
			where: { id: build.id },
			data: { log: await runnerJobsLog(build.id, false) }
		});
	}
}

export async function sweepRunnerJobs(): Promise<void> {
	for (const task of [requeueStaleJobs, failTimedOutJobs, skipUnservedArches]) {
		await task().catch((e) => console.error(`Runner sweep step ${task.name} failed:`, e));
	}
}

export function startRunnerSweeper(): void {
	if (started) return;
	started = true;
	setInterval(sweepRunnerJobs, SWEEP_INTERVAL_MS);
	setInterval(
		() => refreshLiveLogs().catch((e) => console.error('Runner log refresh failed:', e)),
		LOG_REFRESH_INTERVAL_MS
	);
}
