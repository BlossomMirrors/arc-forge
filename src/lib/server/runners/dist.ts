import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import type { RunnerArch } from './status';

export type RunnerManifest = {
	version: string;
	arches: Partial<Record<RunnerArch, { sha256: string; size: number }>>;
};

const CACHE_MS = 60_000;
let cached: { manifest: RunnerManifest | null; expiresAt: number } | null = null;

export function runnerDistDir(): string {
	return env.RUNNER_DIST_DIR || '/app/runner-dist';
}

export function runnerBinaryPath(arch: RunnerArch): string {
	return join(runnerDistDir(), `forge-runner-${arch}`);
}

export async function readRunnerManifest(): Promise<RunnerManifest | null> {
	if (cached && cached.expiresAt > Date.now()) return cached.manifest;
	let manifest: RunnerManifest | null;
	try {
		manifest = JSON.parse(await readFile(join(runnerDistDir(), 'manifest.json'), 'utf8'));
	} catch {
		manifest = null;
	}
	cached = { manifest, expiresAt: Date.now() + CACHE_MS };
	return manifest;
}
