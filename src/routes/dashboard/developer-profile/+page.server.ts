import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { notifyUser } from '$lib/server/notifications';
import { requestDeveloperVerification } from '$lib/server/developer-verification';
import type { Actions, PageServerLoad } from './$types';

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const [memberships, invitations] = await Promise.all([
		db.developerProfileMember.findMany({
			where: { userId: locals.user.id },
			include: {
				developerProfile: {
					include: {
						verificationRequests: { orderBy: { createdAt: 'desc' }, take: 1 }
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
	return { memberships, invitations };
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

	// Owner-only: deletes the developer profile and every PWA submitted under it.
	// Checked here directly (not delegated to auth.api.deleteOrganization) because
	// deleting the associated apps has to happen atomically with the profile itself.
	deleteProfile: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const developerProfileId = data.get('developerProfileId') as string;
		if (!developerProfileId) return fail(400);

		const membership = await db.developerProfileMember.findFirst({
			where: { userId: locals.user.id, developerProfileId }
		});
		if (membership?.role !== 'owner') {
			throw error(403, 'Only an owner can delete a developer profile');
		}

		await db.$transaction([
			db.pwaApp.deleteMany({ where: { developerProfileId } }),
			db.developerProfile.delete({ where: { id: developerProfileId } })
		]);
	}
};
