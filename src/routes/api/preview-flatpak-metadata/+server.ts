import { extractAppstreamMetadata, iconFileExtension } from '$lib/server/flatpak-publish';
import { isStaff } from '$lib/server/authz';
import { hasAnyDeveloperProfile } from '$lib/server/developer-profile';
import type { RequestHandler } from './$types';

// Read-only preview shown right after a bundle upload, before the submitter hits
// Create, so they can confirm what Forge actually read out of their bundle instead
// of finding out only after submitting. Reuses the same extraction the real
// submission runs (see resolveBundleSubmission), but never uploads the icon to
// R2, a discarded preview shouldn't leave orphaned files in storage.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (!isStaff(locals.user) && !(await hasAnyDeveloperProfile(locals.user.id))) {
		return new Response('Unauthorized', { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const bundleUrl = (body as Record<string, unknown>)?.bundleUrl;
	if (typeof bundleUrl !== 'string' || !bundleUrl) {
		return new Response('Bad Request', { status: 400 });
	}

	const extracted = await extractAppstreamMetadata(bundleUrl);
	if (!extracted.ok || !extracted.appid) {
		return Response.json({ ok: false, error: extracted.error, log: extracted.log });
	}

	const translations = extracted.translations ?? {
		en: {
			name: extracted.name || extracted.appid,
			summary: extracted.summary ?? '',
			description: extracted.description ?? ''
		}
	};
	const defaultLang = translations.en ? 'en' : Object.keys(translations)[0];

	return Response.json({
		ok: true,
		appid: extracted.appid,
		developerName: extracted.developerName ?? '',
		screenshots: extracted.screenshots ?? [],
		iconDataUrl: extracted.iconBuffer
			? `data:image/${iconFileExtension(extracted.iconBuffer) === 'svg' ? 'svg+xml' : 'png'};base64,${extracted.iconBuffer.toString('base64')}`
			: null,
		translations,
		defaultLang
	});
};
