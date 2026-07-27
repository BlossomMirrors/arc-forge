import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/authz';
import { encryptSecret } from '$lib/server/secrets';
import { generateSshKeypair, repairAppstream } from '$lib/server/flatpak-publish';
import {
	infraAccessExpiresAt,
	requestInfraAccessCode,
	requireVerifiedInfraAccess,
	signOutInfraAccess,
	verifyInfraAccessCode
} from '$lib/server/infra-access';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	if (!locals.session) throw error(401);
	const sessionId = locals.session.id;

	const verification = await db.infraAccessVerification.findUnique({ where: { sessionId } });
	const expiresAt = verification?.verifiedAt ? infraAccessExpiresAt(verification.verifiedAt) : null;
	if (!expiresAt || expiresAt.getTime() <= Date.now()) return { verified: false as const };

	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	return {
		verified: true as const,
		accessExpiresAt: expiresAt.toISOString(),
		sshPublicKey: settings?.sshPublicKey ?? null,
		hasSshKey: !!settings?.sshPrivateKeyEncrypted,
		hasGpgPassphrase: !!settings?.gpgPassphraseEncrypted,
		remoteHost: settings?.remoteHost ?? 'repo.blossomos.org',
		remoteUser: settings?.remoteUser ?? 'forge',
		remoteRepoPath: settings?.remoteRepoPath ?? '/srv/repos/flatpak',
		buildWorkDir: settings?.buildWorkDir ?? ''
	};
};

export const actions: Actions = {
	requestAccessCode: async ({ locals }) => {
		const admin = requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		if (!admin.email) return fail(400, { error: 'Your account has no email on file' });

		await requestInfraAccessCode(locals.session.id, admin.email);
	},

	verifyAccessCode: async ({ request, locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		const data = await request.formData();
		const code = (data.get('code') as string) ?? '';
		if (!code) return fail(400, { error: 'Enter the code' });

		const result = await verifyInfraAccessCode(locals.session.id, code);
		if (!result.ok) return fail(400, { error: result.error });
	},

	signOutAccess: async ({ locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await signOutInfraAccess(locals.session.id);
	},

	// Destructive: invalidates whatever's currently authorized on the remote host.
	// The UI gates this behind a confirm dialog before submitting.
	generateSshKey: async ({ locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const { publicKey, privateKeyOpenSsh } = generateSshKeypair();
		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { sshPublicKey: publicKey, sshPrivateKeyEncrypted: encryptSecret(privateKeyOpenSsh) },
			create: {
				id: 'singleton',
				sshPublicKey: publicKey,
				sshPrivateKeyEncrypted: encryptSecret(privateKeyOpenSsh)
			}
		});
	},

	setGpgPassphrase: async ({ request, locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const data = await request.formData();
		const passphrase = (data.get('passphrase') as string) ?? '';
		if (!passphrase) return fail(400, { error: 'Passphrase is required' });

		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { gpgPassphraseEncrypted: encryptSecret(passphrase) },
			create: { id: 'singleton', gpgPassphraseEncrypted: encryptSecret(passphrase) }
		});
	},

	updateRemote: async ({ request, locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const data = await request.formData();
		const remoteHost = ((data.get('remoteHost') as string) ?? '').trim();
		const remoteUser = ((data.get('remoteUser') as string) ?? '').trim();
		const remoteRepoPath = ((data.get('remoteRepoPath') as string) ?? '').trim();
		// Optional: falls back to the remote host's default TMPDIR when unset.
		const buildWorkDir = ((data.get('buildWorkDir') as string) ?? '').trim() || null;
		if (!remoteHost || !remoteUser || !remoteRepoPath) {
			return fail(400, { error: 'All fields are required' });
		}

		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { remoteHost, remoteUser, remoteRepoPath, buildWorkDir },
			create: { id: 'singleton', remoteHost, remoteUser, remoteRepoPath, buildWorkDir }
		});
	},

	// Manual repair for when the appstream branch is already broken/stale, deliberately
	// not run automatically on every publish (see flatpak-publish.ts). Synchronous:
	// this is a deliberate one-off admin action, not a per-submission background job.
	repairAppstreamAction: async ({ locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const result = await repairAppstream();
		if (!result.ok) return fail(500, { error: 'Repair failed', log: result.log });
		return { repaired: true, log: result.log };
	}
};
