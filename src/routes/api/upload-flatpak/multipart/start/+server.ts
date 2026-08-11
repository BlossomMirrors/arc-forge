import { createMultipartUpload } from '$lib/server/r2';
import { env } from '$env/dynamic/private';
import { maxBundleBytes, requireBundleUploader } from '$lib/server/flatpak-upload-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = await requireBundleUploader(locals.user);
	if (denied) return denied;

	const { filename, size } = await request.json();
	if (typeof filename !== 'string' || !filename) {
		return new Response('No filename provided', { status: 400 });
	}
	// Validated by extension, not MIME type: browsers commonly report .flatpak
	// files as application/octet-stream since it isn't a registered MIME type.
	if (!filename.toLowerCase().endsWith('.flatpak')) {
		return new Response('Only .flatpak bundle files are accepted', { status: 415 });
	}
	const limit = maxBundleBytes(env);
	if (typeof size !== 'number' || size <= 0) {
		return new Response('No file size provided', { status: 400 });
	}
	if (size > limit) {
		return new Response(`File too large (max ${Math.round(limit / (1024 * 1024))} MB)`, {
			status: 413
		});
	}

	const { uploadId, key } = await createMultipartUpload(`${crypto.randomUUID()}.flatpak`);
	return Response.json({ uploadId, key });
};
