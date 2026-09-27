import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { SCRATCH_ROOT } from '../flatpak-publish';

export const ARTIFACT_ROOT = `${SCRATCH_ROOT}/runner-artifacts`;
export const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export function artifactPathFor(jobId: string): string {
	return `${ARTIFACT_ROOT}/${jobId}.tar`;
}

export async function artifactSize(jobId: string): Promise<number> {
	try {
		return (await stat(artifactPathFor(jobId))).size;
	} catch {
		return 0;
	}
}

export async function appendArtifactChunk(jobId: string, chunk: Buffer): Promise<number> {
	await mkdir(ARTIFACT_ROOT, { recursive: true });
	const handle = await open(artifactPathFor(jobId), 'a');
	try {
		await handle.write(chunk);
	} finally {
		await handle.close();
	}
	return artifactSize(jobId);
}

export async function removeArtifact(jobId: string): Promise<void> {
	await rm(artifactPathFor(jobId), { force: true });
}

export function sha256OfArtifact(jobId: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		createReadStream(artifactPathFor(jobId))
			.on('data', (chunk) => hash.update(chunk))
			.on('error', reject)
			.on('end', () => resolve(hash.digest('hex')));
	});
}
