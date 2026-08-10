import { error } from '@sveltejs/kit';
import { open, stat } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import type { RequestHandler } from './$types';

// Serves the Flatpak OSTree repo directly off the Hetzner-Volume-backed
// mount shared (read-only here) with the `builder` container - see
// docker-compose.yml's flatpak-repo volume and flatpak-publish.ts's
// CONTAINER_REPO_PATH for the writing side of this same mount. No R2/CDN
// involved for Flatpaks at all: that bucket holds unrelated content (RPMs)
// this repo can't share a domain with, so this route + this host's own
// bandwidth is the only thing serving flatpak clients now.
const REPO_ROOT = '/repo';

// refs/heads/* and summary/summary.sig genuinely change on every publish -
// caching those aggressively would leave clients stuck on a stale repo state
// indefinitely. Everything under objects/ or deltas/ is content-addressed
// and immutable once written, safe to cache forever.
function cacheControlFor(relPath: string): string {
	if (relPath.startsWith('objects/') || relPath.startsWith('deltas/')) {
		return 'public, max-age=31536000, immutable';
	}
	return 'no-cache';
}

// Rejects any resolved path that escapes REPO_ROOT (a `..`-laden relPath) -
// params.path comes straight from the URL, never trust it as already safe.
function resolveRepoPath(relPath: string): string | null {
	const resolved = normalize(join(REPO_ROOT, relPath));
	if (resolved !== REPO_ROOT && !resolved.startsWith(REPO_ROOT + sep)) return null;
	return resolved;
}

// Single "bytes=start-end" range only - ostree/flatpak's own libcurl-based
// fetcher never sends multi-range requests. Returns null for anything it
// doesn't understand, same as most static file servers treat a malformed
// Range header: ignore it and serve the whole file.
function parseRange(header: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, startStr, endStr] = match;
	if (!startStr && !endStr) return null;

	let start: number;
	let end: number;
	if (!startStr) {
		// Suffix range ("bytes=-500" - last 500 bytes).
		const suffixLength = Number(endStr);
		if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
		start = Math.max(0, size - suffixLength);
		end = size - 1;
	} else {
		start = Number(startStr);
		end = endStr ? Number(endStr) : size - 1;
	}
	if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
		return null;
	}
	return { start, end };
}

// Reads the requested range (or the whole file) into memory and returns it
// as the response body - not a true stream. Simple and portable across the
// Deno/Node compat layer this runs under; large static-delta objects are
// exactly what Range requests exist for, so a client resuming/parallelizing
// a big download naturally bounds each individual request's size itself.
async function serve(
	relPath: string,
	method: 'GET' | 'HEAD',
	rangeHeader: string | null
): Promise<Response> {
	const resolved = resolveRepoPath(relPath);
	if (!resolved) throw error(403, 'Forbidden');

	const stats = await stat(resolved).catch(() => null);
	if (!stats || !stats.isFile()) throw error(404, 'Not found');

	const headers = new Headers({
		'content-type': 'application/octet-stream',
		'accept-ranges': 'bytes',
		'cache-control': cacheControlFor(relPath),
		'last-modified': stats.mtime.toUTCString()
	});

	const range = rangeHeader ? parseRange(rangeHeader, stats.size) : null;
	if (rangeHeader && !range) {
		headers.set('content-range', `bytes */${stats.size}`);
		return new Response(null, { status: 416, headers });
	}

	const length = range ? range.end - range.start + 1 : stats.size;
	headers.set('content-length', String(length));
	if (range) headers.set('content-range', `bytes ${range.start}-${range.end}/${stats.size}`);

	if (method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });

	const handle = await open(resolved, 'r');
	try {
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, range?.start ?? 0);
		return new Response(buffer, { status: range ? 206 : 200, headers });
	} finally {
		await handle.close();
	}
}

export const GET: RequestHandler = ({ params, request }) =>
	serve(params.path ?? '', 'GET', request.headers.get('range'));

export const HEAD: RequestHandler = ({ params, request }) =>
	serve(params.path ?? '', 'HEAD', request.headers.get('range'));
