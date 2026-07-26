import { uploadFile } from '$lib/server/bunny';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import type { RequestHandler } from './$types';

// Company/organization papers - PDFs, or a photo/scan of a physical document.
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	// Verification requests can only be filed by an owner/admin of the profile in
	// question (see developer-verification.ts), but that's checked at request time -
	// this just gates uploading a document at all to the same "must actually have a
	// developer profile" bar the other upload endpoints use.
	if (!isStaff(locals.user) && !(await hasAnyDeveloperProfile(locals.user.id))) {
		return new Response('You need a developer profile before uploading', { status: 403 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || !file.size) {
		return new Response('No file provided', { status: 400 });
	}
	if (!ALLOWED_TYPES.has(file.type)) {
		return new Response('Unsupported file type (PDF, JPEG, PNG or WebP only)', { status: 415 });
	}
	if (file.size > MAX_BYTES) {
		return new Response('File too large (max 25 MB)', { status: 413 });
	}

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
	const filename = `${crypto.randomUUID()}.${ext}`;

	const url = await uploadFile(await file.arrayBuffer(), filename);
	return Response.json({ url, filename: file.name });
};
