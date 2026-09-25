import { db } from '../db';

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const RUNNER_ARCHES = ['x86_64', 'aarch64'] as const;
export const PRIMARY_ARCH = 'x86_64';

export type RunnerArch = (typeof RUNNER_ARCHES)[number];

export function isRunnerArch(value: unknown): value is RunnerArch {
	return typeof value === 'string' && (RUNNER_ARCHES as readonly string[]).includes(value);
}

export function onlineSince(): Date {
	return new Date(Date.now() - ONLINE_WINDOW_MS);
}

export function isRunnerOnline(runner: {
	lastSeenAt: Date | null;
	tokenHash: string | null;
}): boolean {
	return (
		!!runner.tokenHash &&
		!!runner.lastSeenAt &&
		runner.lastSeenAt.getTime() >= Date.now() - ONLINE_WINDOW_MS
	);
}

export async function hasOnlineRunner(arch: string): Promise<boolean> {
	const count = await db.runner.count({
		where: { arch, tokenHash: { not: null }, lastSeenAt: { gte: onlineSince() } }
	});
	return count > 0;
}
