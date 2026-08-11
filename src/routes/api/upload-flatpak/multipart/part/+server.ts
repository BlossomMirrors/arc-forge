import { REMOTE_PREFIX, uploadPart } from '$lib/server/r2';
import { env } from '$env/dynamic/private';
import {
	maxBundleBytes,
	maxPartCount,
	MAX_PART_BYTES,
	requireBundleUploader
} from '$lib/server/flatpak-upload-auth';
import type { RequestHandler } from './$types';

const KEY_PATTERN = new RegExp(`^${REMOTE_PREFIX}[0-9a-f-]{36}\\.flatpak$`);

export const PUT: RequestHandler = async ({ request, url, locals }) => {
	const denied = await requireBundleUploader(locals.user);
	if (denied) return denied;

	const key = url.searchParams.get('key') ?? '';
	const uploadId = url.searchParams.get('uploadId') ?? '';
	const partNumber = Number(url.searchParams.get('partNumber'));
	if (!KEY_PATTERN.test(key) || !uploadId) {
		return new Response('Invalid upload reference', { status: 400 });
	}
	const maxParts = maxPartCount(maxBundleBytes(env));
	if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > maxParts) {
		return new Response('Invalid part number', { status: 400 });
	}

	const body = Buffer.from(await request.arrayBuffer());
	if (!body.length || body.length > MAX_PART_BYTES) {
		return new Response('Invalid part size', { status: 413 });
	}

	const etag = await uploadPart(key, uploadId, partNumber, body);
	return Response.json({ etag });
};
