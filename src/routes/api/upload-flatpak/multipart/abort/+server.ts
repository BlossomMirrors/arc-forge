import { REMOTE_PREFIX, abortMultipartUpload } from '$lib/server/r2';
import { requireBundleUploader } from '$lib/server/flatpak-upload-auth';
import type { RequestHandler } from './$types';

const KEY_PATTERN = new RegExp(`^${REMOTE_PREFIX}[0-9a-f-]{36}\\.flatpak$`);

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = await requireBundleUploader(locals.user);
	if (denied) return denied;

	const { key, uploadId } = await request.json();
	if (!KEY_PATTERN.test(key) || !uploadId) {
		return new Response('Invalid upload reference', { status: 400 });
	}

	await abortMultipartUpload(key, uploadId);
	return new Response(null, { status: 204 });
};
