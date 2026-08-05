import { uploadFile } from '$lib/server/r2';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'image/avif'
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	// Only reached by non-staff via the PWA submission form (staff also use this for
	// front page images, which isn't gated by a developer profile at all). A PWA
	// submission can't be completed without one anyway (see pwas/new's action), so
	// don't let image uploads happen before that either.
	if (!isStaff(locals.user) && !(await hasAnyDeveloperProfile(locals.user.id))) {
		return new Response('You need a developer profile before uploading', { status: 403 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || !file.size) {
		return new Response('No file provided', { status: 400 });
	}
	if (!ALLOWED_TYPES.has(file.type)) {
		return new Response('Unsupported file type', { status: 415 });
	}
	if (file.size > MAX_BYTES) {
		return new Response('File too large (max 10 MB)', { status: 413 });
	}

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
	const filename = `${crypto.randomUUID()}.${ext}`;

	const url = await uploadFile(await file.arrayBuffer(), filename);
	return Response.json({ url });
};
