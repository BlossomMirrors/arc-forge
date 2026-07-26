import { error } from '@sveltejs/kit';
import type { auth } from '$lib/auth';

type SessionUser = typeof auth.$Infer.Session.user;
type MaybeUser = SessionUser | null | undefined;

export const STAFF_ROLE = 'staff';
export const REVIEWER_ROLE = 'forge-reviewer';
export const ADMIN_ROLE = 'admin';

function hasRole(user: MaybeUser, role: string): boolean {
	return (user?.roles ?? []).includes(role);
}

export function isStaff(user: MaybeUser): boolean {
	return hasRole(user, STAFF_ROLE);
}

export function isReviewer(user: MaybeUser): boolean {
	return isStaff(user) || hasRole(user, REVIEWER_ROLE);
}

// Independent of staff/reviewer: a narrow group scoped to infra secrets
// (SSH key, GPG passphrase), not general dashboard/content permissions.
export function isAdmin(user: MaybeUser): boolean {
	return hasRole(user, ADMIN_ROLE);
}

// Throws on every unauthorized call site (load AND actions) rather than only
// hiding nav links, since form actions are reachable directly by POSTing to
// their URL without ever running the page's load function.
export function requireStaff(user: MaybeUser): SessionUser {
	if (!user || !isStaff(user)) throw error(403, 'Staff access required');
	return user;
}

export function requireReviewer(user: MaybeUser): SessionUser {
	if (!user || !isReviewer(user)) throw error(403, 'Reviewer access required');
	return user;
}

export function requireAdmin(user: MaybeUser): SessionUser {
	if (!user || !isAdmin(user)) throw error(403, 'Admin access required');
	return user;
}
