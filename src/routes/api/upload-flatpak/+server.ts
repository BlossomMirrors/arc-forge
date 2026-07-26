import { uploadFile } from '$lib/server/bunny';
import { env } from '$env/dynamic/private';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import type { RequestHandler } from './$types';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
// Bundles are much larger than images; the default FTP timeout in bunny.ts is too short.
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function maxBytes(): number {
	const configured = Number(env.FLATPAK_MAX_BUNDLE_BYTES);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	// A submission can't be completed without a developer profile anyway (see
	// flatpaks/new's action), so don't let a bundle upload happen at all before
	// that - avoids wasting Bunny storage/bandwidth on uploads no one can submit.
	if (!isStaff(locals.user) && !(await hasAnyDeveloperProfile(locals.user.id))) {
		return new Response('You need a developer profile before uploading a Flatpak bundle', {
			status: 403
		});
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || !file.size) {
		return new Response('No file provided', { status: 400 });
	}
	// Validated by extension, not MIME type: browsers commonly report .flatpak
	// files as application/octet-stream since it isn't a registered MIME type.
	if (!file.name.toLowerCase().endsWith('.flatpak')) {
		return new Response('Only .flatpak bundle files are accepted', { status: 415 });
	}
	const limit = maxBytes();
	if (file.size > limit) {
		return new Response(`File too large (max ${Math.round(limit / (1024 * 1024))} MB)`, {
			status: 413
		});
	}

	const filename = `${crypto.randomUUID()}.flatpak`;
	const url = await uploadFile(await file.arrayBuffer(), filename, UPLOAD_TIMEOUT_MS);
	return Response.json({ url, filename: file.name, size: file.size });
};
