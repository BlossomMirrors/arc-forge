import { uploadFile } from '$lib/server/r2';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import type { RequestHandler } from './$types';

// Unlike the other upload endpoints (fixed allowlists for icons/documents), screenshots
// can legitimately come in any image format a developer's tooling happens to produce,
// so any file.type starting with "image/" is accepted rather than a fixed set.
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (!isStaff(locals.user) && !(await hasAnyDeveloperProfile(locals.user.id))) {
		return new Response('You need a developer profile before uploading', { status: 403 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || !file.size) {
		return new Response('No file provided', { status: 400 });
	}
	if (!file.type.startsWith('image/')) {
		return new Response('Unsupported file type (must be an image)', { status: 415 });
	}
	if (file.size > MAX_BYTES) {
		return new Response('File too large (max 15 MB)', { status: 413 });
	}

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
	const filename = `${crypto.randomUUID()}.${ext}`;

	const url = await uploadFile(await file.arrayBuffer(), filename);
	return Response.json({ url, mimeType: file.type, fileName: file.name, fileSize: file.size });
};
