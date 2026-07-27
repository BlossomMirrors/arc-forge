import { db } from './db';

const ARC_API_BASE = 'https://arpi.blossomos.org/api/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export type AppSearchResult = {
	ref: string;
	name: string;
	summary: string;
	iconUrl: string | null;
};

type ArcSearchHit = {
	id: string;
	name: string;
	summary: string;
};

// Native (Flathub + blossomos) apps, via the already-deployed arc HTTP API rather
// than Forge maintaining its own Flathub search integration. Empty results on any
// failure rather than surfacing an error, a flaky external search shouldn't break
// list-building, it should just come up short for this keystroke.
async function searchNativeApps(query: string): Promise<AppSearchResult[]> {
	try {
		const res = await fetch(`${ARC_API_BASE}/search?q=${encodeURIComponent(query)}`, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (!res.ok) return [];
		const hits = (await res.json()) as ArcSearchHit[];
		return hits.map((h) => ({
			ref: h.id,
			name: h.name,
			summary: h.summary,
			iconUrl: `${ARC_API_BASE}/apps/${encodeURIComponent(h.id)}/icon`
		}));
	} catch {
		return [];
	}
}

// Forge's own PWAs aren't Flatpaks, arpi.blossomos.org has no idea they exist, so
// they're searched locally and given the "pwa:" prefix arc-daemon's own PWA
// provider already uses to tell a PWA app id apart from a Flatpak one.
async function searchPwas(query: string): Promise<AppSearchResult[]> {
	const pwas = await db.pwaApp.findMany({
		where: {
			status: 'APPROVED',
			OR: [
				{ name: { contains: query, mode: 'insensitive' } },
				{ appid: { contains: query, mode: 'insensitive' } },
				{ summary: { contains: query, mode: 'insensitive' } }
			]
		},
		select: { appid: true, name: true, summary: true, iconUrl: true },
		take: 20
	});
	return pwas.map((p) => ({
		ref: `pwa:${p.appid}`,
		name: p.name,
		summary: p.summary,
		iconUrl: p.iconUrl
	}));
}

export async function searchApps(query: string): Promise<AppSearchResult[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const [pwas, native] = await Promise.all([searchPwas(trimmed), searchNativeApps(trimmed)]);
	const seen = new Set<string>();
	const results: AppSearchResult[] = [];
	for (const r of [...pwas, ...native]) {
		if (seen.has(r.ref)) continue;
		seen.add(r.ref);
		results.push(r);
	}
	return results;
}
