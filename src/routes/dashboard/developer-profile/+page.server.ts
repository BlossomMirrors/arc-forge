import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { notifyUser } from '$lib/server/notifications';
import { requestDeveloperVerification } from '$lib/server/developer-verification';
import {
	deleteDeveloperProfile,
	suspendDeveloperProfile,
	unsuspendDeveloperProfile
} from '$lib/server/developer-profile';
import { slugify } from '$lib/slug';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const [memberships, invitations] = await Promise.all([
		db.developerProfileMember.findMany({
			where: { userId: locals.user.id },
			include: {
				developerProfile: {
					include: {
						verificationRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
						// Outgoing invites this profile has sent that haven't been accepted/declined
						// yet, shown as a "Pending" badge so inviting someone has visible feedback.
						invitations: { where: { status: 'pending' }, orderBy: { createdAt: 'desc' } },
						members: {
							include: { user: { select: { id: true, name: true, email: true } } },
							orderBy: { createdAt: 'asc' }
						}
					}
				}
			},
			orderBy: { createdAt: 'asc' }
		}),
		db.developerProfileInvitation.findMany({
			where: { email: locals.user.email, status: 'pending' },
			include: { developerProfile: true, inviter: { select: { name: true, email: true } } },
			orderBy: { createdAt: 'desc' }
		})
	]);
	return { memberships, invitations, isStaff: isStaff(locals.user) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const name = ((data.get('name') as string) ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });
		const slug = slugify((data.get('slug') as string) || name);
		if (!slug) return fail(400, { error: 'Could not derive a slug from that name' });

		// Developer names are checked against a submission's AppStream metadata to catch
		// impersonation (see flatpak-submission.ts), that check is meaningless if two
		// different profiles can both claim the same name, so it must be unique.
		const nameTaken = await db.developerProfile.findFirst({
			where: { name: { equals: name, mode: 'insensitive' } }
		});
		if (nameTaken) return fail(400, { error: 'That developer name is already taken' });

		try {
			await auth.api.createOrganization({
				headers: request.headers,
				body: { name, slug }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not create developer profile' });
			throw e;
		}
	},

	invite: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const email = ((data.get('email') as string) ?? '').trim();
		const requestedRole = data.get('role') as string;
		const role =
			requestedRole === 'owner' ? 'owner' : requestedRole === 'admin' ? 'admin' : 'member';
		if (!developerProfileId || !email) return fail(400, { error: 'Missing fields' });

		// Only an owner can hand out ownership. Admins can invite as admin/member (the
		// plugin's own invite:create permission covers that), but minting a new owner
		// is a bigger grant than "can send invitations" should imply on its own.
		if (role === 'owner') {
			const membership = await db.developerProfileMember.findFirst({
				where: { userId: locals.user.id, developerProfileId }
			});
			if (membership?.role !== 'owner') {
				return fail(403, { error: 'Only an owner can invite someone as owner' });
			}
		}

		try {
			await auth.api.createInvitation({
				headers: request.headers,
				body: { organizationId: developerProfileId, email, role }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not send invitation' });
			throw e;
		}

		// Only notifiable if they already have a Forge account; otherwise the invitation
		// still shows up on this page once they sign in for the first time, matched by email.
		const invitedUser = await db.user.findUnique({ where: { email } });
		if (invitedUser) {
			const profile = await db.developerProfile.findUnique({ where: { id: developerProfileId } });
			await notifyUser(invitedUser.id, {
				type: 'dev_invite',
				title: `You were invited to ${profile?.name ?? 'a developer profile'}`,
				link: `/dashboard/developer-profile`
			});
		}
	},

	acceptInvitation: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const invitationId = data.get('invitationId') as string;
		if (!invitationId) return fail(400);

		try {
			await auth.api.acceptInvitation({ headers: request.headers, body: { invitationId } });
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not accept invitation' });
			throw e;
		}
	},

	rejectInvitation: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const invitationId = data.get('invitationId') as string;
		if (!invitationId) return fail(400);

		try {
			await auth.api.rejectInvitation({ headers: request.headers, body: { invitationId } });
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not reject invitation' });
			throw e;
		}
	},

	// Revokes an invitation this profile sent that hasn't been accepted/declined
	// yet. better-auth checks the caller actually has "invitation:cancel"
	// permission on that invite's own developer profile, no need to re-check here.
	cancelInvitation: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const invitationId = data.get('invitationId') as string;
		if (!invitationId) return fail(400);

		try {
			await auth.api.cancelInvitation({ headers: request.headers, body: { invitationId } });
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not cancel invitation' });
			throw e;
		}
	},

	// better-auth enforces the actual rules here (owner/admin only via member:delete,
	// and refuses to remove the last owner), no need to re-check either one ourselves,
	// same trust-the-plugin posture as cancelInvitation above.
	removeMember: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const memberIdOrEmail = data.get('memberId') as string;
		if (!developerProfileId || !memberIdOrEmail) return fail(400);

		try {
			await auth.api.removeMember({
				headers: request.headers,
				body: { organizationId: developerProfileId, memberIdOrEmail }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not remove member' });
			throw e;
		}
	},

	// Same trust-the-plugin posture: better-auth already refuses to hand out/take away
	// owner unless the caller is themselves an owner, and won't let the last owner
	// demote themselves.
	updateMemberRole: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const memberId = data.get('memberId') as string;
		const requestedRole = data.get('role') as string;
		const role =
			requestedRole === 'owner' ? 'owner' : requestedRole === 'admin' ? 'admin' : 'member';
		if (!developerProfileId || !memberId) return fail(400);

		try {
			await auth.api.updateMemberRole({
				headers: request.headers,
				body: { organizationId: developerProfileId, memberId, role }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not update member role' });
			throw e;
		}
	},

	leave: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		if (!developerProfileId) return fail(400);

		try {
			await auth.api.leaveOrganization({
				headers: request.headers,
				body: { organizationId: developerProfileId }
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { error: e.body?.message ?? 'Could not leave developer profile' });
			throw e;
		}
	},

	requestVerification: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const dunsNumber = ((data.get('dunsNumber') as string) ?? '').trim();
		const documentUrls = ((data.get('documentUrls') as string) ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		if (!developerProfileId) return fail(400);

		const result = await requestDeveloperVerification({
			userId: locals.user.id,
			developerProfileId,
			dunsNumber,
			documentUrls
		});
		if (!result.ok) return fail(400, { error: result.error });
	},

	// Owner (or staff) only: deletes the developer profile and every PWA/Flatpak
	// submitted under it, unpublishing any live Flatpaks from the signed repo first
	// (see deleteDeveloperProfile). Checked here directly (not delegated to
	// auth.api.deleteOrganization) because deleting the associated apps has to happen
	// alongside the profile itself, not as a separate uncoordinated step.
	deleteProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		if (!developerProfileId) return fail(400);

		if (!isStaff(locals.user)) {
			const membership = await db.developerProfileMember.findFirst({
				where: { userId: locals.user.id, developerProfileId }
			});
			if (membership?.role !== 'owner') {
				throw error(403, 'Only an owner can delete a developer profile');
			}
		}

		const result = await deleteDeveloperProfile(developerProfileId);
		if (!result.ok) return fail(500, { error: result.error, log: result.log });
	},

	// Owner (or staff) only, same bar as deleteProfile: renaming is a structural
	// change to the whole team's public identity, not routine content editing.
	// Always drops verified status on an actual name change (not resubmitting the
	// same name) - a review only ever verified the OLD name, so it can't still
	// vouch for a new one, the team has to request verification again.
	renameProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const name = ((data.get('name') as string) ?? '').trim();
		if (!developerProfileId || !name) return fail(400, { error: 'Name is required' });

		if (!isStaff(locals.user)) {
			const membership = await db.developerProfileMember.findFirst({
				where: { userId: locals.user.id, developerProfileId }
			});
			if (membership?.role !== 'owner') {
				throw error(403, 'Only an owner can rename a developer profile');
			}
		}

		const existing = await db.developerProfile.findUnique({ where: { id: developerProfileId } });
		if (!existing) return fail(404);
		if (name === existing.name) return;

		const nameTaken = await db.developerProfile.findFirst({
			where: { name: { equals: name, mode: 'insensitive' }, NOT: { id: developerProfileId } }
		});
		if (nameTaken) return fail(400, { error: 'That developer name is already taken' });

		await db.developerProfile.update({
			where: { id: developerProfileId },
			data: { name, verified: false, verifiedById: null, verifiedAt: null }
		});
	},

	// Staff-only, reachable independently of a formal abuse report - see
	// suspendDeveloperProfile for what this actually does (pulls every APPROVED
	// PWA/Flatpak, unpublishes any live Flatpak from the repo, blocks new
	// submissions while set).
	suspendProfile: async ({ request, locals }) => {
		const staff = isStaff(locals.user);
		if (!locals.user || !staff) throw error(403);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		const reason = ((data.get('reason') as string) ?? '').trim();
		if (!developerProfileId) return fail(400);

		const result = await suspendDeveloperProfile(developerProfileId, locals.user.id, reason);
		if (!result.ok) return fail(500, { error: result.error, log: result.log });

		const members = await db.developerProfileMember.findMany({
			where: { developerProfileId }
		});
		await Promise.all(
			members.map((member) =>
				notifyUser(member.userId, {
					type: 'profile_suspended',
					title: 'Your developer profile was suspended',
					body: reason || undefined,
					link: '/dashboard/developer-profile'
				})
			)
		);
	},

	unsuspendProfile: async ({ locals, request }) => {
		if (!locals.user || !isStaff(locals.user)) throw error(403);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		if (!developerProfileId) return fail(400);

		await unsuspendDeveloperProfile(developerProfileId);
	}
};
