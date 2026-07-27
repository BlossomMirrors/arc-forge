import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import { PAGE_SIZE, pageCount, parsePage } from '$lib/server/pagination';
import { resolveReportTarget } from '$lib/server/reports';
import { suspendDeveloperProfile } from '$lib/server/developer-profile';
import { unpublishFlatpak } from '$lib/server/flatpak-publish';
import { notifyUser } from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireReviewer(locals.user);

	const page = parsePage(url, 'page');
	const reviewedPage = parsePage(url, 'reviewedPage');

	const [pending, pendingTotal, recentlyReviewed, recentlyReviewedTotal] = await Promise.all([
		db.report.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.report.count({ where: { status: 'PENDING' } }),
		db.report.findMany({
			where: { status: { in: ['DISMISSED', 'ACTIONED'] } },
			orderBy: { reviewedAt: 'desc' },
			skip: (reviewedPage - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			include: { reviewedBy: { select: { name: true, email: true } } }
		}),
		db.report.count({ where: { status: { in: ['DISMISSED', 'ACTIONED'] } } })
	]);

	const [pendingWithTarget, recentlyReviewedWithTarget] = await Promise.all([
		Promise.all(
			pending.map(async (report) => ({
				...report,
				target: await resolveReportTarget(report.targetType, report.targetId)
			}))
		),
		Promise.all(
			recentlyReviewed.map(async (report) => ({
				...report,
				target: await resolveReportTarget(report.targetType, report.targetId)
			}))
		)
	]);

	return {
		pending: pendingWithTarget,
		page,
		totalPages: pageCount(pendingTotal),
		recentlyReviewed: recentlyReviewedWithTarget,
		reviewedPage,
		reviewedTotalPages: pageCount(recentlyReviewedTotal)
	};
};

export const actions: Actions = {
	dismiss: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const report = await db.report.findUnique({ where: { id } });
		if (!report) throw error(404, 'Report not found');

		await db.report.update({
			where: { id },
			data: {
				status: 'DISMISSED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null
			}
		});
	},

	// Type-dispatches to whatever takedown already exists for that kind of content -
	// no new content-state machinery, a report just triggers the same pull/suspend
	// actions a reviewer could already take on their own. LIST has no pull lifecycle
	// (AppList is deliberately unmoderated), so it has no case here, the review UI
	// only ever links to the list's own page for that report type.
	takeAction: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);
		const report = await db.report.findUnique({ where: { id } });
		if (!report) throw error(404, 'Report not found');

		if (report.targetType === 'PWA') {
			const app = await db.pwaApp.findUnique({ where: { id: report.targetId } });
			if (app && app.status === 'APPROVED') {
				await db.pwaApp.update({
					where: { id: app.id },
					data: {
						status: 'PULLED',
						reviewedById: reviewer.id,
						reviewedAt: new Date(),
						reviewNote: note || 'Pulled via abuse report'
					}
				});
				if (app.submittedById) {
					await notifyUser(app.submittedById, {
						type: 'pwa_pulled',
						title: `${app.name} was pulled from the store`,
						body: note || undefined,
						link: `/dashboard/pwas/${app.id}`
					});
				}
			}
		} else if (report.targetType === 'FLATPAK') {
			const app = await db.flatpakApp.findUnique({ where: { id: report.targetId } });
			if (app && app.status === 'APPROVED') {
				const { ok, log } = await unpublishFlatpak(app);
				if (!ok) return fail(500, { error: 'Failed to remove from the repo', log });
				await db.flatpakApp.update({
					where: { id: app.id },
					data: {
						status: 'PULLED',
						reviewedById: reviewer.id,
						reviewedAt: new Date(),
						reviewNote: note || 'Pulled via abuse report',
						buildLog: log
					}
				});
				if (app.submittedById) {
					await notifyUser(app.submittedById, {
						type: 'flatpak_pulled',
						title: `${app.name} was pulled from the store`,
						body: note || undefined,
						link: `/dashboard/flatpaks/${app.id}`
					});
				}
			}
		} else if (report.targetType === 'DEVELOPER_PROFILE') {
			const result = await suspendDeveloperProfile(
				report.targetId,
				reviewer.id,
				note || 'Suspended via abuse report'
			);
			if (!result.ok) return fail(500, { error: result.error, log: result.log });

			const members = await db.developerProfileMember.findMany({
				where: { developerProfileId: report.targetId }
			});
			await Promise.all(
				members.map((member) =>
					notifyUser(member.userId, {
						type: 'profile_suspended',
						title: 'Your developer profile was suspended',
						body: note || undefined,
						link: '/dashboard/developer-profile'
					})
				)
			);
		}

		await db.report.update({
			where: { id },
			data: {
				status: 'ACTIONED',
				reviewedById: reviewer.id,
				reviewedAt: new Date(),
				reviewNote: note || null
			}
		});
	}
};
