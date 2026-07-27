import { db } from './db';
import { unpublishFlatpak } from './flatpak-publish';

export type DeleteProfileResult = { ok: true } | { ok: false; error: string; log?: string };

// Deletes a developer profile and every PWA/Flatpak submitted under it - used by both
// an owner deleting their own profile and a staff member deleting someone else's.
// Any currently-published Flatpak has to come off the signed repo first (same rule as
// deleting a single Flatpak, see dashboard/flatpaks/+page.server.ts), a failed or
// in-progress unpublish aborts the whole deletion rather than leaving an orphaned,
// unmanaged app on the repo or a half-deleted profile.
export async function deleteDeveloperProfile(
	developerProfileId: string
): Promise<DeleteProfileResult> {
	const flatpaks = await db.flatpakApp.findMany({ where: { developerProfileId } });

	if (flatpaks.some((app) => app.status === 'PROCESSING')) {
		return { ok: false, error: 'A build is currently in progress for one of these Flatpaks' };
	}

	for (const app of flatpaks) {
		if (app.status !== 'APPROVED') continue;
		const { ok, log } = await unpublishFlatpak(app);
		if (!ok) {
			return { ok: false, error: `Could not remove ${app.appid} from the repo`, log };
		}
	}

	await db.$transaction([
		db.pwaApp.deleteMany({ where: { developerProfileId } }),
		db.flatpakApp.deleteMany({ where: { developerProfileId } }),
		db.developerProfile.delete({ where: { id: developerProfileId } })
	]);
	return { ok: true };
}

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

async function isOwnerOrAdmin(userId: string, developerProfileId: string): Promise<boolean> {
	const membership = await db.developerProfileMember.findFirst({
		where: { userId, developerProfileId }
	});
	return membership?.role === 'owner' || membership?.role === 'admin';
}

async function isProfileMember(userId: string, developerProfileId: string): Promise<boolean> {
	const membership = await db.developerProfileMember.findFirst({
		where: { userId, developerProfileId }
	});
	return membership !== null;
}

// Editing a PWA/Flatpak/Screenshot/List is normal team collaboration, so any
// member of the same developer profile can do it, not just the original
// submitter, matching why the listing pages already show it to the whole team.
export async function canEditListing(
	userId: string,
	isUserStaff: boolean,
	submitterId: string | null,
	developerProfileId: string | null
): Promise<boolean> {
	if (isUserStaff || submitterId === userId) return true;
	if (!developerProfileId) return false;
	return isProfileMember(userId, developerProfileId);
}

// Deleting is more consequential than editing (an approved Flatpak comes off the
// signed repo immediately, with no re-review step the way an edit gets), so a
// teammate needs owner/admin to delete someone else's submission, not just
// membership. Deleting your own is still always allowed regardless of role.
export async function canDeleteListing(
	userId: string,
	isUserStaff: boolean,
	submitterId: string | null,
	developerProfileId: string | null
): Promise<boolean> {
	if (isUserStaff || submitterId === userId) return true;
	if (!developerProfileId) return false;
	return isOwnerOrAdmin(userId, developerProfileId);
}

// Staff can move anything anywhere, same bypass used everywhere else in Forge.
// Everyone else needs owner/admin on the destination profile, and, if the item
// already belongs to a profile, owner/admin there too, so a plain member can't
// pull content out of a team profile on their own, and can't drop content into
// a profile they don't actually help run.
export async function canMoveBetweenProfiles(
	userId: string,
	isUserStaff: boolean,
	sourceProfileId: string | null,
	destProfileId: string
) {
	const destProfile = await db.developerProfile.findUnique({ where: { id: destProfileId } });
	if (!destProfile) return null;
	if (isUserStaff) return destProfile;

	if (!(await isOwnerOrAdmin(userId, destProfileId))) return null;
	if (sourceProfileId && !(await isOwnerOrAdmin(userId, sourceProfileId))) return null;

	return destProfile;
}
