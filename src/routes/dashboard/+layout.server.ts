import { redirect } from '@sveltejs/kit';
import { isStaff, isReviewer, isAdmin } from '$lib/server/authz';
import { listNotifications, unreadNotificationCount } from '$lib/server/notifications';
import { listMyDeveloperProfiles } from '$lib/server/developer-profile';
import { db } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

async function gravatar(email: string, size = 80): Promise<string> {
	const normalized = email.trim().toLowerCase();
	const encoded = new TextEncoder().encode(normalized);
	const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
	const hash = Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `https://gravatar.com/avatar/${hash}?s=${size}&d=mp`;
}

export const load: LayoutServerLoad = async ({ locals, route }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const avatarUrl = locals.user.image ?? (await gravatar(locals.user.email));
	const [notifications, unreadCount, developerProfiles, emailPrefs] = await Promise.all([
		listNotifications(locals.user.id, 20),
		unreadNotificationCount(locals.user.id),
		listMyDeveloperProfiles(locals.user.id),
		db.user.findUnique({
			where: { id: locals.user.id },
			select: { emailNotificationsEnabled: true }
		})
	]);

	const activeDeveloperProfileId = locals.session?.activeOrganizationId ?? null;
	const activeDeveloperProfile =
		developerProfiles.find((p) => p.id === activeDeveloperProfileId) ?? null;

	// First dashboard visit on a fresh session with no active profile chosen yet, and
	// there's actually a choice to make, send the user to pick one. A session always
	// starts with activeOrganizationId null (see auth.ts's session field mapping), so
	// this fires naturally once per login rather than looping.
	if (
		(route.id as string) !== '/dashboard/select-developer-profile' &&
		!activeDeveloperProfile &&
		developerProfiles.length > 0
	) {
		throw redirect(302, '/dashboard/select-developer-profile');
	}

	return {
		user: locals.user,
		avatarUrl,
		isStaff: isStaff(locals.user),
		isReviewer: isReviewer(locals.user),
		isAdmin: isAdmin(locals.user),
		notifications,
		unreadCount,
		developerProfiles,
		activeDeveloperProfileId: activeDeveloperProfile?.id ?? null,
		emailNotificationsEnabled: emailPrefs?.emailNotificationsEnabled ?? true
	};
};
