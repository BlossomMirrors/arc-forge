import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { isStaff } from '$lib/server/authz';
import {
	listMyDeveloperProfiles,
	requireOwnDeveloperProfile,
	canMoveBetweenProfiles,
	canEditListing
} from '$lib/server/developer-profile';
import { notifyReviewers, notifyUser } from '$lib/server/notifications';
import { resolveFlatpakSubmission, type FlatpakSource } from '$lib/server/flatpak-submission';
import { hasGithubAccount } from '$lib/server/github';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401);
	const app = await db.flatpakApp.findUnique({ where: { id: params.id } });
	if (!app) throw error(404, 'Flatpak not found');
	if (
		!(await canEditListing(
			locals.user.id,
			isStaff(locals.user),
			app.submittedById,
			app.developerProfileId
		))
	) {
		throw error(403, 'You can only edit your own submissions');
	}

	const staff = isStaff(locals.user);
	const developerProfiles = staff ? [] : await listMyDeveloperProfiles(locals.user.id);

	// Eager-loaded here (single app, cheap) rather than client-fetched like the
	// review list page - see flatpak-build-history.svelte's initialBuilds prop.
	const builds = await db.flatpakBuild.findMany({
		where: { flatpakAppId: app.id },
		orderBy: { startedAt: 'desc' },
		take: 10,
		select: {
			id: true,
			status: true,
			gitCommit: true,
			startedAt: true,
			finishedAt: true,
			triggeredBy: { select: { name: true } }
		}
	});

	return {
		app,
		isStaff: staff,
		developerProfiles,
		hasGithubAccount: await hasGithubAccount(locals.user.id),
		builds: builds.map((b) => ({
			id: b.id,
			status: b.status,
			gitCommit: b.gitCommit,
			triggeredBy: b.triggeredBy?.name ?? null,
			startedAt: b.startedAt,
			finishedAt: b.finishedAt
		}))
	};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!locals.user) throw error(401);
		const existing = await db.flatpakApp.findUnique({ where: { id: params.id } });
		if (!existing) throw error(404, 'Flatpak not found');
		if (
			!(await canEditListing(
				locals.user.id,
				isStaff(locals.user),
				existing.submittedById,
				existing.developerProfileId
			))
		) {
			throw error(403, 'You can only edit your own submissions');
		}
		if (existing.status === 'PROCESSING') {
			return fail(409, { error: 'A build is currently in progress for this app' });
		}

		const data = await request.formData();

		// The source type (bundle vs git) is fixed at first submission - editing only
		// updates fields within that same source, not switching between them.
		let source: FlatpakSource;
		if (existing.sourceType === 'GIT') {
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
		let developerProfileId: string | null = existing.developerProfileId;
		let claimedDeveloperName = '';
		if (!staff) {
			const requestedProfileId = data.get('developerProfileId') as string;
			if (!requestedProfileId) return fail(400, { error: 'Select a developer profile' });
			const profile =
				requestedProfileId === existing.developerProfileId
					? await requireOwnDeveloperProfile(locals.user.id, requestedProfileId)
					: await canMoveBetweenProfiles(
							locals.user.id,
							false,
							existing.developerProfileId,
							requestedProfileId
						);
			if (!profile) {
				return fail(403, {
					error: 'You do not have permission to file this under that developer profile'
				});
			}
			if (profile.suspended) {
				return fail(403, {
					error: 'This developer profile is suspended and cannot submit changes'
				});
			}
			developerProfileId = profile.id;
			claimedDeveloperName = profile.name;
		}

		const resolved = await resolveFlatpakSubmission({
			source,
			isStaff: staff,
			claimedDeveloperName,
			existingAppId: existing.appid
		});
		if (!resolved.ok) return fail(400, { error: resolved.error, log: resolved.log });

		// Unlike PWAs, there's no staff auto-approve here: "approved" means "actually
		// built and live", which only the review page's approve action can make true.
		// Any edit, staff included, resets to PENDING (or REJECTED on a fresh developer
		// mismatch) so it goes through review again with a fresh build from the
		// corrected bundle/repo.
		await db.flatpakApp.update({
			where: { id: params.id },
			data: {
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
				...(source.kind === 'bundle'
					? { bundleUrl: source.bundleUrl, bundleFileName, bundleSize }
					: {
							gitUrl: source.gitUrl,
							gitBranch: source.gitBranch,
							gitManifestPath: source.gitManifestPath,
							gitLastCommit: resolved.gitLastCommit
						}),
				status: resolved.status,
				reviewedById: null,
				reviewedAt: resolved.status === 'REJECTED' ? new Date() : null,
				reviewNote: resolved.reviewNote,
				buildLog: null,
				buildStartedAt: null,
				buildFinishedAt: null
			}
		});

		if (resolved.status === 'REJECTED') {
			await notifyUser(locals.user.id, {
				type: 'flatpak_auto_rejected',
				title: `${resolved.name} was auto-rejected`,
				body: resolved.reviewNote ?? undefined,
				link: `/dashboard/flatpaks/${params.id}`
			});
		} else {
			await notifyReviewers({
				type: 'flatpak_pending',
				title: `Flatpak resubmitted for review: ${resolved.name}`,
				link: `/dashboard/review/flatpaks`
			});
		}
		throw redirect(303, '/dashboard/flatpaks');
	}
};
