import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { db } from '../db';
import { decryptSecret } from '../secrets';
import type { FlatpakApp, FlatpakBuild, RunnerJob } from '$lib/generated/prisma/client';
import {
	finalizeLaunchFailure,
	launchDetachedRun,
	sidecarPathsFromRunDir,
	trackBuild,
	type RunPaths
} from '../flatpak-publish';
import { buildImportScript } from './import-script';
import { runnerJobsLog } from './logs';
import { cancelJobsForBuild } from './queue';
import { PRIMARY_ARCH } from './status';

const finalizing = new Set<string>();
const rerun = new Set<string>();

function runPathsOf(build: FlatpakBuild): RunPaths {
	const runDir = dirname(build.remoteLogPath);
	return {
		runDir,
		scriptPath: build.screenSessionName,
		logPath: build.remoteLogPath,
		exitPath: build.remoteExitPath,
		passphrasePath: `${runDir}/pass`,
		gpgKeyPath: `${runDir}/gpgkey`,
		...sidecarPathsFromRunDir(runDir)
	};
}

async function writeSidecars(paths: RunPaths, jobs: RunnerJob[]): Promise<void> {
	const primary = jobs.find((j) => j.arch === PRIMARY_ARCH) ?? jobs[0];
	await mkdir(paths.runDir, { recursive: true });
	await writeFile(paths.commitPath, primary.gitCommit ?? '');
	await writeFile(paths.metainfoPath, primary.metainfoB64 ?? '');
	await writeFile(paths.iconPath, primary.iconB64 ?? '');
}

async function launchImport(
	build: FlatpakBuild & { flatpakApp: FlatpakApp },
	jobs: RunnerJob[]
): Promise<void> {
	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	if (!settings?.gpgPrivateKeyEncrypted || !settings.gpgPassphraseEncrypted) {
		await finalizeLaunchFailure(
			build.id,
			build.flatpakApp,
			`${await runnerJobsLog(build.id)}Infra settings are not fully configured (missing GPG key or GPG passphrase).`
		);
		return;
	}

	const paths = runPathsOf(build);
	await writeSidecars(paths, jobs);
	const { ok, log } = await launchDetachedRun(paths, buildImportScript(paths, jobs), [
		{ path: paths.passphrasePath, contents: decryptSecret(settings.gpgPassphraseEncrypted) },
		{ path: paths.gpgKeyPath, contents: decryptSecret(settings.gpgPrivateKeyEncrypted) }
	]);
	if (!ok) {
		await finalizeLaunchFailure(
			build.id,
			build.flatpakApp,
			`${await runnerJobsLog(build.id)}${log}`
		);
		return;
	}
	trackBuild(build.id);
}

async function finalizeOnce(buildId: string): Promise<void> {
	const build = await db.flatpakBuild.findUnique({
		where: { id: buildId },
		include: { jobs: true, flatpakApp: true }
	});
	if (!build || build.finishedAt) return;

	const active = build.jobs.filter((j) => j.status !== 'SKIPPED');
	const broken = active.find((j) => j.status === 'FAILED' || j.status === 'CANCELLED');
	if (broken) {
		await cancelJobsForBuild(build.id);
		const reason =
			broken.status === 'CANCELLED'
				? `The ${broken.arch} build was cancelled.`
				: `The ${broken.arch} build failed.`;
		await finalizeLaunchFailure(
			build.id,
			build.flatpakApp,
			`${await runnerJobsLog(build.id, false)}\n${reason}`
		);
		return;
	}
	if (active.length === 0) {
		await finalizeLaunchFailure(
			build.id,
			build.flatpakApp,
			`${await runnerJobsLog(build.id, false)}\nNo architecture could be built.`
		);
		return;
	}
	if (active.some((j) => j.status !== 'UPLOADED')) return;

	await launchImport(build, active);
}

export async function maybeFinalizeBuild(buildId: string): Promise<void> {
	if (finalizing.has(buildId)) {
		rerun.add(buildId);
		return;
	}
	finalizing.add(buildId);
	try {
		do {
			rerun.delete(buildId);
			await finalizeOnce(buildId);
		} while (rerun.has(buildId));
	} catch (e) {
		console.error(`Failed to finalize runner build ${buildId}:`, e);
	} finally {
		finalizing.delete(buildId);
		rerun.delete(buildId);
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export async function resumeRunnerBuild(build: FlatpakBuild): Promise<void> {
	const jobCount = await db.runnerJob.count({ where: { flatpakBuildId: build.id } });
	if (jobCount === 0 || (await exists(build.remoteLogPath))) {
		trackBuild(build.id);
		return;
	}
	await maybeFinalizeBuild(build.id);
}
