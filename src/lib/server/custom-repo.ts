import { readdir } from 'node:fs/promises';

// Reads app ids straight off the shared repo mount (same one flatpak-publish.ts
// writes to and src/routes/flatpak/[...path]/+server.ts serves from) instead of
// an HTTP round trip to itself scraping a directory listing - Forge has direct
// local filesystem access to this now, no more R2/CDN involved for Flatpaks at
// all. Each subdirectory name under refs/heads/app/ is a published app id.
const APP_REFS_DIR = '/repo/refs/heads/app';
const TTL_MS = 60 * 60 * 1000; // 1 hour

let cached: string[] = [];
let cachedAt = 0;

export async function getCustomRepoIds(): Promise<string[]> {
	if (cached.length && Date.now() - cachedAt < TTL_MS) return cached;

	try {
		const entries = await readdir(APP_REFS_DIR, { withFileTypes: true });
		cached = entries.filter((e) => e.isDirectory()).map((e) => e.name);
		cachedAt = Date.now();
	} catch {
		// keep stale cache on error
	}

	return cached;
}
