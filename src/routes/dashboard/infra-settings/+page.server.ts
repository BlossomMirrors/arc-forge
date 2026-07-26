import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/authz';
import { encryptSecret } from '$lib/server/secrets';
import { generateSshKeypair, repairAppstream } from '$lib/server/flatpak-publish';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	return {
		sshPublicKey: settings?.sshPublicKey ?? null,
		hasSshKey: !!settings?.sshPrivateKeyEncrypted,
		hasGpgPassphrase: !!settings?.gpgPassphraseEncrypted,
		remoteHost: settings?.remoteHost ?? 'repo.blossomos.org',
		remoteUser: settings?.remoteUser ?? 'forge',
		remoteRepoPath: settings?.remoteRepoPath ?? '/srv/repos/flatpak'
	};
};

export const actions: Actions = {
	// Destructive: invalidates whatever's currently authorized on the remote host.
	// The UI gates this behind a confirm dialog before submitting.
	generateSshKey: async ({ locals }) => {
		requireAdmin(locals.user);
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
		const data = await request.formData();
		const remoteHost = ((data.get('remoteHost') as string) ?? '').trim();
		const remoteUser = ((data.get('remoteUser') as string) ?? '').trim();
		const remoteRepoPath = ((data.get('remoteRepoPath') as string) ?? '').trim();
		if (!remoteHost || !remoteUser || !remoteRepoPath) {
			return fail(400, { error: 'All fields are required' });
		}

		await db.infraSettings.upsert({
			where: { id: 'singleton' },
			update: { remoteHost, remoteUser, remoteRepoPath },
			create: { id: 'singleton', remoteHost, remoteUser, remoteRepoPath }
		});
	},

	// Manual repair for when the appstream branch is already broken/stale, deliberately
	// not run automatically on every publish (see flatpak-publish.ts). Synchronous:
	// this is a deliberate one-off admin action, not a per-submission background job.
	repairAppstreamAction: async ({ locals }) => {
		requireAdmin(locals.user);
		const result = await repairAppstream();
		if (!result.ok) return fail(500, { error: 'Repair failed', log: result.log });
		return { repaired: true, log: result.log };
	}
};
