import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import { listMyDeveloperProfiles, requireOwnDeveloperProfile } from '$lib/server/developer-profile';
import { notifyReviewers, notifyUser } from '$lib/server/notifications';
import { resolveFlatpakSubmission, type FlatpakSource } from '$lib/server/flatpak-submission';
import { hasGithubAccount } from '$lib/server/github';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const staff = isStaff(locals.user);
	const developerProfiles = staff ? [] : await listMyDeveloperProfiles(locals.user.id);
	return {
		isStaff: staff,
		developerProfiles,
		hasGithubAccount: await hasGithubAccount(locals.user.id)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) throw error(401);
		const data = await request.formData();
		const sourceKind = (data.get('sourceKind') as string) === 'git' ? 'git' : 'bundle';

		let source: FlatpakSource;
		if (sourceKind === 'git') {
			const gitUrl = ((data.get('gitUrl') as string) ?? '').trim();
			const gitBranch = ((data.get('gitBranch') as string) ?? '').trim() || 'main';
			const gitManifestPath = ((data.get('gitManifestPath') as string) ?? '').trim();
			if (!gitUrl || !gitManifestPath) {
				return fail(400, { error: 'Git repo URL and manifest path are required' });
			}
			source = { kind: 'git', gitUrl, gitBranch, gitManifestPath };
		} else {
			const bundleUrl = ((data.get('bundleUrl') as string) ?? '').trim();
			if (!bundleUrl) return fail(400, { error: 'Upload a Flatpak bundle first' });
			source = { kind: 'bundle', bundleUrl };
		}
		const bundleFileName = ((data.get('bundleFileName') as string) ?? '').trim();
		const bundleSize = Number(data.get('bundleSize') ?? 0);

		const staff = isStaff(locals.user);
		let developerProfileId: string | null = null;
		let claimedDeveloperName = '';
		if (!staff) {
			const requestedProfileId = data.get('developerProfileId') as string;
			if (!requestedProfileId) return fail(400, { error: 'Select a developer profile' });
			const profile = await requireOwnDeveloperProfile(locals.user.id, requestedProfileId);
			if (!profile) return fail(403, { error: 'You are not a member of that developer profile' });
			if (profile.suspended) {
				return fail(403, { error: 'This developer profile is suspended and cannot submit new apps' });
			}
			developerProfileId = profile.id;
			claimedDeveloperName = profile.name;
		}
		// Staff have no developerName field to fill in at all (see FlatpakForm.svelte):
		// for a bundle, it's read straight from the bundle's own AppStream data below;
		// for a git repo there's nothing to read until a build actually runs, so it
		// starts empty and can be corrected via the edit page once one has.

		const resolved = await resolveFlatpakSubmission({
			source,
			isStaff: staff,
			claimedDeveloperName
		});
		if (!resolved.ok) return fail(400, { error: resolved.error, log: resolved.log });

		// Unlike PWAs, staff submissions here are NOT auto-approved: approving a Flatpak
		// triggers a real SSH build/sign/publish against the production repo, so every
		// submission (staff included) always starts PENDING and needs an explicit
		// review approve action to kick that off, unless it was auto-rejected below.
		const app = await db.flatpakApp.create({
			data: {
				appid: resolved.appid,
				branch: resolved.branch,
				name: resolved.name,
				summary: resolved.summary,
				description: resolved.description,
				iconUrl: resolved.iconUrl,
				screenshots: resolved.screenshots,
				homepageUrl: resolved.homepageUrl,
				contentRating: resolved.contentRating,
				developerName: staff ? resolved.developerName : claimedDeveloperName,
				developerProfileId,
				sourceType: sourceKind === 'git' ? 'GIT' : 'BUNDLE',
				...(source.kind === 'bundle'
					? { bundleUrl: source.bundleUrl, bundleFileName, bundleSize }
					: {
							gitUrl: source.gitUrl,
							gitBranch: source.gitBranch,
							gitManifestPath: source.gitManifestPath,
							gitLastCommit: resolved.gitLastCommit
						}),
				submittedById: locals.user.id,
				status: resolved.status,
				reviewNote: resolved.reviewNote,
				reviewedAt: resolved.status === 'REJECTED' ? new Date() : null
			}
		});

		if (resolved.status === 'REJECTED') {
			await notifyUser(locals.user.id, {
				type: 'flatpak_auto_rejected',
				title: `${app.name} was auto-rejected`,
				body: resolved.reviewNote ?? undefined,
				link: `/dashboard/flatpaks/${app.id}`
			});
		} else {
			await notifyReviewers({
				type: 'flatpak_pending',
				title: `New Flatpak submitted: ${app.name}`,
				link: `/dashboard/review/flatpaks`
			});
		}
		throw redirect(303, '/dashboard/flatpaks');
	}
};
