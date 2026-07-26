import { db } from './db';

export async function listMyDeveloperProfiles(userId: string) {
	const memberships = await db.developerProfileMember.findMany({
		where: { userId },
		include: { developerProfile: true },
		orderBy: { createdAt: 'asc' }
	});
	return memberships.map((m) => ({ ...m.developerProfile, role: m.role }));
}

// Cheap existence check used to gate PWA/Flatpak submission and upload, staff bypass
// this everywhere else, so this is only ever called for non-staff users.
export async function hasAnyDeveloperProfile(userId: string): Promise<boolean> {
	const membership = await db.developerProfileMember.findFirst({ where: { userId } });
	return membership !== null;
}

// Confirms the user actually belongs to the developer profile before we trust it as the
// source of a PWA's developer name; never take a developerProfileId at face value from a form.
export async function requireOwnDeveloperProfile(userId: string, developerProfileId: string) {
	const membership = await db.developerProfileMember.findFirst({
		where: { userId, developerProfileId },
		include: { developerProfile: true }
	});
	return membership?.developerProfile ?? null;
}
