import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/authz';
import { encryptSecret } from '$lib/server/secrets';
import {
	generateSshKeypair,
	repairAppstream,
	abortAllProcessingBuilds
} from '$lib/server/flatpak-publish';
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
		hasGpgPrivateKey: !!settings?.gpgPrivateKeyEncrypted,
		hasGpgPassphrase: !!settings?.gpgPassphraseEncrypted,
		remoteHost: settings?.remoteHost ?? 'repo.blossomos.org',
		remoteUser: settings?.remoteUser ?? 'forge',
		r2BucketName: settings?.r2BucketName ?? 'blossom-repos',
		r2RepoPath: settings?.r2RepoPath ?? 'flatpak',
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

	// Uploads the actual signing key material rather than assuming it already
	// exists on the remote host's own keyring - see the gpgPrivateKeyEncrypted
	// comment in schema.prisma for why. Only a loose armor-header sanity check:
	// real validation happens on the remote host at import time (see
	// buildGpgImportSection in flatpak-publish.ts), which also derives and uses
	// the key's actual fingerprint, so nothing here needs to parse OpenPGP.
	setGpgPrivateKey: async ({ request, locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const data = await request.formData();
		const privateKey = ((data.get('privateKey') as string) ?? '').trim();
		if (!privateKey) return fail(400, { error: 'Private key is required' });
		if (!privateKey.includes('BEGIN PGP PRIVATE KEY BLOCK')) {
			return fail(400, { error: 'That does not look like an ASCII-armored PGP private key' });
		}

		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { gpgPrivateKeyEncrypted: encryptSecret(privateKey) },
			create: { id: 'singleton', gpgPrivateKeyEncrypted: encryptSecret(privateKey) }
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
		const r2BucketName = ((data.get('r2BucketName') as string) ?? '').trim();
		const r2RepoPath = ((data.get('r2RepoPath') as string) ?? '').trim();
		// Optional: falls back to the remote host's default TMPDIR when unset.
		const buildWorkDir = ((data.get('buildWorkDir') as string) ?? '').trim() || null;
		if (!remoteHost || !remoteUser || !r2BucketName || !r2RepoPath) {
			return fail(400, { error: 'All fields are required' });
		}

		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { remoteHost, remoteUser, r2BucketName, r2RepoPath, buildWorkDir },
			create: { id: 'singleton', remoteHost, remoteUser, r2BucketName, r2RepoPath, buildWorkDir }
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
	},

	// Emergency stop for stuck/misbehaving builds: best-effort kills whatever's
	// actually still running remotely and marks every PROCESSING app FAILED. The
	// UI gates this behind a confirm dialog too, same as repairAppstreamAction.
	abortProcessingBuildsAction: async ({ locals }) => {
		requireAdmin(locals.user);
		if (!locals.session) throw error(401);
		await requireVerifiedInfraAccess(locals.session.id);

		const result = await abortAllProcessingBuilds();
		if (!result.ok) return fail(500, { error: 'Some builds failed to update', log: result.log });
		return { aborted: true, log: result.log, count: result.count };
	}
};
