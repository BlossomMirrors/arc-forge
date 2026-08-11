import type { auth } from '$lib/auth';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import { CHUNK_BYTES } from '$lib/shared/flatpak-upload';

type SessionUser = typeof auth.$Infer.Session.user;

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB

export function maxBundleBytes(env: { FLATPAK_MAX_BUNDLE_BYTES?: string }): number {
	const configured = Number(env.FLATPAK_MAX_BUNDLE_BYTES);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

// The client uploads in 10 MiB chunks (see bundle-upload-button.svelte); this is a
// generous ceiling above that, not the target chunk size, so a malicious client can't
// turn a handful of oversized parts into an unbounded upload.
export const MAX_PART_BYTES = 32 * 1024 * 1024;

// Bounded by the client's actual chunk size, not MAX_PART_BYTES - that's a ceiling on
// a single part's size, not the size a well-behaved upload actually uses, and bounding
// part count by it would reject legitimate large uploads long before they reach maxBytes.
export function maxPartCount(maxBytes: number): number {
	return Math.ceil(maxBytes / CHUNK_BYTES) + 4;
}

// A submission can't be completed without a developer profile anyway (see
// flatpaks/new's action), so don't let a bundle upload happen at all before
// that - avoids wasting R2 storage/bandwidth on uploads no one can submit.
// Shared across every step of the multipart flow (start/part/complete/abort)
// since each is a separate request and none of them trust the others.
export async function requireBundleUploader(
	user: SessionUser | null | undefined
): Promise<Response | null> {
	if (!user) return new Response('Unauthorized', { status: 401 });
	if (!isStaff(user) && !(await hasAnyDeveloperProfile(user.id))) {
		return new Response('You need a developer profile before uploading a Flatpak bundle', {
			status: 403
		});
	}
	return null;
}
