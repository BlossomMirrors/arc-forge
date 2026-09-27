import { db } from '../db';
import type { Runner, RunnerJob } from '$lib/generated/prisma/client';
import { removeArtifact } from './artifacts';
import { maybeFinalizeBuild } from './finalize';
import { hasOnlineRunner, PRIMARY_ARCH, RUNNER_ARCHES } from './status';

export const MAX_ATTEMPTS = 3;

export type ClaimedJob = {
	id: string;
	appid: string;
	arch: string;
	gitUrl: string;
	gitBranch: string;
	manifestPath: string;
};

export async function queueGitBuild(buildId: string): Promise<void> {
	const arches: string[] = [];
	for (const arch of RUNNER_ARCHES) {
		if (arch === PRIMARY_ARCH || (await hasOnlineRunner(arch))) arches.push(arch);
	}
	await db.runnerJob.createMany({
		data: arches.map((arch) => ({ flatpakBuildId: buildId, arch }))
	});
}

export async function failJob(job: RunnerJob, error: string): Promise<void> {
	await db.runnerJob.update({
		where: { id: job.id },
		data: {
			status: 'FAILED',
			error,
			log: `${job.log}\n${error}\n`,
			finishedAt: new Date(),
			cancelRequested: true
		}
	});
	await removeArtifact(job.id);
	await maybeFinalizeBuild(job.flatpakBuildId);
}

export async function skipJob(job: RunnerJob): Promise<void> {
	const { count } = await db.runnerJob.updateMany({
		where: { id: job.id, status: 'QUEUED' },
		data: { status: 'SKIPPED', finishedAt: new Date() }
	});
	if (count === 1) await maybeFinalizeBuild(job.flatpakBuildId);
}

export async function requeueJob(job: RunnerJob, reason: string): Promise<void> {
	await removeArtifact(job.id);
	if (job.attempts >= MAX_ATTEMPTS) {
		await failJob(job, `${reason}. Giving up after ${job.attempts} attempts.`);
		return;
	}
	const { count } = await db.runnerJob.updateMany({
		where: { id: job.id, status: 'RUNNING' },
		data: {
			status: 'QUEUED',
			runnerId: null,
			claimedAt: null,
			log: `${job.log}\n${reason}, the job was queued again.\n`
		}
	});
	if (count === 1 && job.arch !== PRIMARY_ARCH && !(await hasOnlineRunner(job.arch))) {
		await skipJob(job);
	}
}

export async function requeueJobsOf(runnerId: string, reason: string): Promise<void> {
	const jobs = await db.runnerJob.findMany({ where: { runnerId, status: 'RUNNING' } });
	for (const job of jobs) await requeueJob(job, reason);
}

export async function cancelJobsForBuild(buildId: string): Promise<void> {
	const jobs = await db.runnerJob.findMany({
		where: { flatpakBuildId: buildId, status: { in: ['QUEUED', 'RUNNING', 'UPLOADED'] } }
	});
	await db.runnerJob.updateMany({
		where: { id: { in: jobs.map((j) => j.id) } },
		data: { status: 'CANCELLED', cancelRequested: true, finishedAt: new Date() }
	});
	for (const job of jobs) await removeArtifact(job.id);
}

export async function claimJob(runner: Runner, arch: string): Promise<ClaimedJob | null> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const candidate = await db.runnerJob.findFirst({
			where: { status: 'QUEUED', arch, cancelRequested: false },
			orderBy: { createdAt: 'asc' },
			include: { flatpakBuild: { include: { flatpakApp: true } } }
		});
		if (!candidate) return null;

		const { count } = await db.runnerJob.updateMany({
			where: { id: candidate.id, status: 'QUEUED' },
			data: {
				status: 'RUNNING',
				runnerId: runner.id,
				claimedAt: new Date(),
				attempts: { increment: 1 },
				logBytes: 0,
				artifactSize: 0
			}
		});
		if (count !== 1) continue;
		await removeArtifact(candidate.id);

		const app = candidate.flatpakBuild.flatpakApp;
		if (!app.gitUrl || !app.gitBranch || !app.gitManifestPath) {
			await failJob(candidate, 'The submission has no git source configured.');
			continue;
		}
		return {
			id: candidate.id,
			appid: app.appid,
			arch: candidate.arch,
			gitUrl: app.gitUrl,
			gitBranch: app.gitBranch,
			manifestPath: app.gitManifestPath
		};
	}
	return null;
}
