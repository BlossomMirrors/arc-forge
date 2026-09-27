import { json } from '@sveltejs/kit';
import { db } from '../db';
import type { Runner, RunnerJob } from '$lib/generated/prisma/client';
import {
	appendArtifactChunk,
	artifactPathFor,
	artifactSize,
	MAX_ARTIFACT_BYTES,
	MAX_CHUNK_BYTES,
	removeArtifact,
	sha256OfArtifact
} from './artifacts';
import { maybeFinalizeBuild } from './finalize';
import { trimLog } from './logs';
import { failJob } from './queue';

export type CompletePayload = {
	success?: boolean;
	error?: string | null;
	gitCommit?: string | null;
	metainfoB64?: string | null;
	iconB64?: string | null;
	refs?: unknown;
	sha256?: string | null;
	size?: number | null;
};

const MAX_SIDECAR_CHARS = 8_000_000;
const REF_PATTERN = /^(app|runtime)\/([A-Za-z0-9._-]+)\/(x86_64|aarch64)\/([A-Za-z0-9._-]+)$/;

export async function loadActiveJob(runner: Runner, jobId: string): Promise<RunnerJob | Response> {
	const job = await db.runnerJob.findUnique({ where: { id: jobId } });
	if (!job || job.runnerId !== runner.id || job.status !== 'RUNNING') {
		return new Response('Gone', { status: 410 });
	}
	return job;
}

export async function appendJobLog(
	job: RunnerJob,
	offset: number,
	text: string
): Promise<Response> {
	const bytes = Buffer.byteLength(text, 'utf8');
	if (offset + bytes <= job.logBytes) return json({ offset: job.logBytes });
	if (offset !== job.logBytes) return json({ offset: job.logBytes }, { status: 409 });

	const { count } = await db.runnerJob.updateMany({
		where: { id: job.id, logBytes: job.logBytes, status: 'RUNNING' },
		data: { log: trimLog(job.log + text), logBytes: job.logBytes + bytes }
	});
	if (count !== 1) {
		const fresh = await db.runnerJob.findUnique({ where: { id: job.id } });
		return json({ offset: fresh?.logBytes ?? 0 }, { status: 409 });
	}
	return json({ offset: job.logBytes + bytes });
}

export async function writeJobArtifact(
	job: RunnerJob,
	offset: number,
	chunk: Buffer
): Promise<Response> {
	const size = await artifactSize(job.id);
	if (offset !== size) return json({ size }, { status: 409 });
	if (chunk.length > MAX_CHUNK_BYTES) return new Response('Chunk too large', { status: 413 });
	if (size + chunk.length > MAX_ARTIFACT_BYTES) {
		await failJob(job, 'The build output is larger than the Forge accepts.');
		return new Response('Gone', { status: 410 });
	}
	return json({ size: await appendArtifactChunk(job.id, chunk) });
}

function validRefs(refs: unknown, appid: string, arch: string): string[] | null {
	if (!Array.isArray(refs) || refs.length === 0 || refs.length > 8) return null;
	for (const ref of refs) {
		if (typeof ref !== 'string') return null;
		const match = REF_PATTERN.exec(ref);
		if (!match) return null;
		const [, , name, refArch] = match;
		if (refArch !== arch) return null;
		if (name !== appid && !name.startsWith(`${appid}.`)) return null;
	}
	return refs as string[];
}

function sidecar(value: string | null | undefined): string | null {
	if (!value || value.length > MAX_SIDECAR_CHARS) return null;
	return /^[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}

export async function completeJob(job: RunnerJob, payload: CompletePayload): Promise<Response> {
	if (!payload.success) {
		await failJob(job, payload.error?.slice(0, 2000) || 'The runner reported a failure.');
		return json({ ok: true });
	}

	const app = await db.flatpakApp.findFirst({
		where: { builds: { some: { id: job.flatpakBuildId } } },
		select: { appid: true }
	});
	const refs = app ? validRefs(payload.refs, app.appid, job.arch) : null;
	if (!refs) {
		await failJob(job, 'The runner reported refs that do not belong to this submission.');
		return json({ ok: true });
	}

	const size = await artifactSize(job.id);
	if (size === 0 || size !== payload.size) {
		await failJob(job, 'The uploaded build output is incomplete.');
		return json({ ok: true });
	}
	if ((await sha256OfArtifact(job.id)) !== payload.sha256?.toLowerCase()) {
		await removeArtifact(job.id);
		await failJob(job, 'The uploaded build output failed its checksum.');
		return json({ ok: true });
	}

	const { count } = await db.runnerJob.updateMany({
		where: { id: job.id, status: 'RUNNING' },
		data: {
			status: 'UPLOADED',
			gitCommit: payload.gitCommit?.slice(0, 64) || null,
			metainfoB64: sidecar(payload.metainfoB64),
			iconB64: sidecar(payload.iconB64),
			refs,
			artifactPath: artifactPathFor(job.id),
			artifactSize: BigInt(size),
			finishedAt: new Date()
		}
	});
	if (count !== 1) return new Response('Gone', { status: 410 });

	await maybeFinalizeBuild(job.flatpakBuildId);
	return json({ ok: true });
}
