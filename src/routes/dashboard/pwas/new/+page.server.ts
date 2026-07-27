import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { saveTranslations, uploadCodeField } from '$lib/server/pwa-form';
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

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const developerProfiles = staff ? [] : await listMyDeveloperProfiles(locals.user.id);
	return { isStaff: staff, developerProfiles };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const fields = await parseForm(data);
		if (!fields.appid || !fields.name) return fail(400, { error: 'Missing required fields' });

		// developerName/developerProfileId are never taken from the submitter's own claim:
		// staff can type a developer name freely, everyone else is pinned to a developer
		// profile they're a verified member of, so nobody but staff can spoof it.
		let developerProfileId: string | null = null;
		if (!isStaff(locals.user)) {
			const requestedProfileId = data.get('developerProfileId') as string;
			if (!requestedProfileId) return fail(400, { error: 'Select a developer profile' });
			const profile = await requireOwnDeveloperProfile(locals.user.id, requestedProfileId);
			if (!profile) return fail(403, { error: 'You are not a member of that developer profile' });
			fields.developerName = profile.name;
			developerProfileId = profile.id;
		}

		const staffSubmission = isStaff(locals.user);
		const app = await db.pwaApp.create({
			data: {
				...fields,
				developerProfileId,
				submittedById: locals.user.id,
				status: staffSubmission ? 'APPROVED' : 'PENDING'
			}
		});
		await saveTranslations(app.id, data);
		if (!staffSubmission) {
			await notifyReviewers({
				type: 'pwa_pending',
				title: `New PWA submitted: ${app.name}`,
				link: `/dashboard/review/pwas`
			});
		}
		throw redirect(303, '/dashboard/pwas');
	}
};
