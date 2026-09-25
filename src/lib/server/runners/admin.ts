import { db } from '../db';
import { readRunnerManifest } from './dist';
import { installCommand } from './install-script';
import { requeueJobsOf } from './queue';
import { isRunnerOnline } from './status';
import { generateRunnerToken } from './tokens';

const MAX_NAME_CHARS = 80;

export function cleanRunnerName(value: FormDataEntryValue | null): string | null {
	const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME_CHARS) : '';
	return name || null;
}

export async function listRunners() {
	const [runners, manifest] = await Promise.all([
		db.runner.findMany({
			orderBy: { createdAt: 'asc' },
			include: { _count: { select: { jobs: { where: { status: 'RUNNING' } } } } }
		}),
		readRunnerManifest()
	]);
	return {
		latestVersion: manifest?.version ?? null,
		runners: runners.map((r) => ({
			id: r.id,
			name: r.name,
			online: isRunnerOnline(r),
			revoked: !r.tokenHash,
			tokenHint: r.tokenHint,
			arch: r.arch,
			hostname: r.hostname,
			os: r.os,
			version: r.version,
			concurrency: r.concurrency,
			lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
			lastIp: r.lastIp,
			runningJobs: r._count.jobs,
			createdAt: r.createdAt.toISOString()
		}))
	};
}

export async function createRunner(name: string, createdById: string) {
	const { token, hash, hint } = generateRunnerToken();
	const runner = await db.runner.create({
		data: { name, tokenHash: hash, tokenHint: hint, createdById }
	});
	return { runnerId: runner.id, name: runner.name, command: installCommand(token) };
}

export async function regenerateRunnerToken(id: string) {
	const { token, hash, hint } = generateRunnerToken();
	const runner = await db.runner.update({
		where: { id },
		data: { tokenHash: hash, tokenHint: hint }
	});
	return { runnerId: runner.id, name: runner.name, command: installCommand(token) };
}

export async function revokeRunnerToken(id: string) {
	await db.runner.update({ where: { id }, data: { tokenHash: null, tokenHint: null } });
	await requeueJobsOf(id, 'The runner token was revoked');
}

export async function renameRunner(id: string, name: string) {
	await db.runner.update({ where: { id }, data: { name } });
}

export async function deleteRunner(id: string) {
	await requeueJobsOf(id, 'The runner was deleted');
	await db.runner.delete({ where: { id } });
}
