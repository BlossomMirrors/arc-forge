import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { saveTranslations, uploadCodeField, fetchCodeField } from '$lib/server/pwa-form';
import { isStaff } from '$lib/server/authz';
import { listMyDeveloperProfiles, requireOwnDeveloperProfile } from '$lib/server/developer-profile';
import { notifyReviewers } from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

async function parseForm(data: FormData) {
	const css = (data.get('css') as string).trim();
	const js = (data.get('js') as string).trim();
	return {
		appid: (data.get('appid') as string).trim(),
		name: (data.get('name') as string).trim(),
		summary: (data.get('summary') as string).trim(),
		description: (data.get('description') as string).trim(),
		iconUrl: (data.get('iconUrl') as string).trim(),
		screenshots: (data.get('screenshots') as string)
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean),
		homepageUrl: (data.get('homepageUrl') as string).trim(),
		contentRating: (data.get('contentRating') as string).trim() || 'All ages',
		developerName: ((data.get('developerName') as string) ?? '').trim(),
		url: (data.get('url') as string).trim(),
		color: (data.get('color') as string).trim() || '#000000',
		css: await uploadCodeField(css, 'css'),
		js: await uploadCodeField(js, 'js'),
		useragent: (data.get('useragent') as string).trim(),
		widevine: data.get('widevine') === 'true',
		tray: data.get('tray') === 'true'
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401);
	const app = await db.pwaApp.findUnique({
		where: { id: params.id },
		include: { translations: true }
	});
	if (!app) throw error(404, 'PWA not found');
	if (!isStaff(locals.user) && app.submittedById !== locals.user.id) {
		throw error(403, 'You can only edit your own submissions');
	}

	const [css, js] = await Promise.all([
		fetchCodeField(app.css ?? ''),
		fetchCodeField(app.js ?? '')
	]);

	const translations = Object.fromEntries(
		app.translations.map((t) => [
			t.lang,
			{ name: t.name, summary: t.summary, description: t.description }
		])
	);
	const staff = isStaff(locals.user);
	const developerProfiles = staff ? [] : await listMyDeveloperProfiles(locals.user.id);
	return { app: { ...app, css, js }, translations, isStaff: staff, developerProfiles };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const existing = await db.pwaApp.findUnique({ where: { id: params.id } });
		if (!existing) throw error(404, 'PWA not found');
		if (!isStaff(locals.user) && existing.submittedById !== locals.user.id) {
			throw error(403, 'You can only edit your own submissions');
		}

		const data = await request.formData();
		const fields = await parseForm(data);
		if (!fields.appid || !fields.name) return fail(400, { error: 'Missing required fields' });

		// developerName/developerProfileId, like status, are never taken from the submitted
		// form for non-staff: they're pinned to a developer profile the editor actually belongs to
		let developerProfileId: string | null = existing.developerProfileId;
		if (!isStaff(locals.user)) {
			const requestedProfileId = data.get('developerProfileId') as string;
			if (!requestedProfileId) return fail(400, { error: 'Select a developer profile' });
			const profile = await requireOwnDeveloperProfile(locals.user.id, requestedProfileId);
			if (!profile) return fail(403, { error: 'You are not a member of that developer profile' });
			fields.developerName = profile.name;
			developerProfileId = profile.id;
		}

		// status is derived from who's saving, never from the submitted form:
		// staff edits are auto-approved, anyone else's edit needs re-review even
		// if the app was already approved, so an edit can't silently bypass review
		const staffEdit = isStaff(locals.user);
		await db.pwaApp.update({
			where: { id: params.id },
			data: staffEdit
				? { ...fields, developerProfileId, status: 'APPROVED' }
				: {
						...fields,
						developerProfileId,
						status: 'PENDING',
						reviewedById: null,
						reviewedAt: null,
						reviewNote: null
					}
		});
		await saveTranslations(params.id, data);
		if (!staffEdit) {
			await notifyReviewers({
				type: 'pwa_pending',
				title: `PWA resubmitted for review: ${fields.name}`,
				link: `/dashboard/review/pwas`
			});
		}
		throw redirect(303, '/dashboard/pwas');
	}
};
