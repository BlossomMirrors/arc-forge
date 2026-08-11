import { REMOTE_PREFIX, completeMultipartUpload } from '$lib/server/r2';
import { requireBundleUploader } from '$lib/server/flatpak-upload-auth';
import type { RequestHandler } from './$types';

const KEY_PATTERN = new RegExp(`^${REMOTE_PREFIX}[0-9a-f-]{36}\\.flatpak$`);

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = await requireBundleUploader(locals.user);
	if (denied) return denied;

	const { key, uploadId, parts } = await request.json();
	if (!KEY_PATTERN.test(key) || !uploadId || !Array.isArray(parts) || !parts.length) {
		return new Response('Invalid upload reference', { status: 400 });
	}
	if (!parts.every((p) => typeof p?.etag === 'string' && Number.isInteger(p?.partNumber))) {
		return new Response('Invalid part list', { status: 400 });
	}

	const url = await completeMultipartUpload(key, uploadId, parts);
	return Response.json({ url });
};
