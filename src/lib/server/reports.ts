import { db } from './db';
import type { ReportReason, ReportTargetType } from '$lib/generated/prisma/client';

// Lowercase-kebab strings used in the public report URL/API, kept separate from
// Prisma's own enum casing so external callers (the public page, and any other
// client hitting POST /api/reports directly) never need to know Forge's internal
// enum names.
const URL_TARGET_TYPES: Record<string, ReportTargetType> = {
	pwa: 'PWA',
	flatpak: 'FLATPAK',
	list: 'LIST',
	'developer-profile': 'DEVELOPER_PROFILE'
};

export function parseTargetTypeParam(value: string): ReportTargetType | null {
	return URL_TARGET_TYPES[value] ?? null;
}

const URL_REASONS: Record<string, ReportReason> = {
	malware_security: 'MALWARE_SECURITY',
	impersonation: 'IMPERSONATION',
	inappropriate_content: 'INAPPROPRIATE_CONTENT',
	broken: 'BROKEN',
	other: 'OTHER'
};

export function parseReasonParam(value: string): ReportReason | null {
	return URL_REASONS[value] ?? null;
}

export interface ResolvedReportTarget {
	name: string;
	iconUrl?: string;
	status?: string;
	href: string;
}

// Looks up the real row by internal id for the reviewer-facing Reports queue -
// targetId is not a real foreign key (see Report's schema comment), so this is
// the one place that resolves it across whichever of the four tables it lives in.
export async function resolveReportTarget(
	targetType: ReportTargetType,
	targetId: string
): Promise<ResolvedReportTarget | null> {
	switch (targetType) {
		case 'PWA': {
			const app = await db.pwaApp.findUnique({ where: { id: targetId } });
			if (!app) return null;
			return { name: app.name, iconUrl: app.iconUrl, status: app.status, href: `/dashboard/pwas/${app.id}` };
		}
		case 'FLATPAK': {
			const app = await db.flatpakApp.findUnique({ where: { id: targetId } });
			if (!app) return null;
			return {
				name: app.name,
				iconUrl: app.iconUrl,
				status: app.status,
				href: `/dashboard/flatpaks/${app.id}`
			};
		}
		case 'LIST': {
			const list = await db.appList.findUnique({ where: { id: targetId } });
			if (!list) return null;
			return { name: list.name, href: `/dashboard/lists/${list.id}` };
		}
		case 'DEVELOPER_PROFILE': {
			const profile = await db.developerProfile.findUnique({ where: { id: targetId } });
			if (!profile) return null;
			return {
				name: profile.name,
				status: profile.suspended ? 'SUSPENDED' : undefined,
				href: `/dashboard/developer-profile`
			};
		}
	}
}

export interface PublicReportTarget {
	id: string;
	name: string;
	iconUrl?: string;
}

// The public-page counterpart: resolves a friendly external reference (the same
// kind of identifier an end user or the arc client already knows) rather than
// Forge's own internal cuid. PWA/Flatpak by appid, List by id or slug (same dual
// lookup GET /api/lists/[id] already does), developer profile by slug.
export async function resolvePublicRef(
	targetType: ReportTargetType,
	ref: string
): Promise<PublicReportTarget | null> {
	switch (targetType) {
		case 'PWA': {
			const app = await db.pwaApp.findUnique({ where: { appid: ref } });
			return app ? { id: app.id, name: app.name, iconUrl: app.iconUrl } : null;
		}
		case 'FLATPAK': {
			const app = await db.flatpakApp.findUnique({ where: { appid: ref } });
			return app ? { id: app.id, name: app.name, iconUrl: app.iconUrl } : null;
		}
		case 'LIST': {
			const list = await db.appList.findFirst({ where: { OR: [{ id: ref }, { slug: ref }] } });
			return list ? { id: list.id, name: list.name } : null;
		}
		case 'DEVELOPER_PROFILE': {
			const profile = await db.developerProfile.findUnique({ where: { slug: ref } });
			return profile ? { id: profile.id, name: profile.name } : null;
		}
	}
}
