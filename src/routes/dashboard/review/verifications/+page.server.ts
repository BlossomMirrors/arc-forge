import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireReviewer } from '$lib/server/authz';
import {
	approveDeveloperVerification,
	rejectDeveloperVerification
} from '$lib/server/developer-verification';
import { PAGE_SIZE, pageCount, parsePage } from '$lib/server/pagination';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireReviewer(locals.user);

	const page = parsePage(url, 'page');

	const [pendingVerifications, pendingTotal] = await Promise.all([
		db.developerVerificationRequest.findMany({
			where: { status: 'PENDING' },
			orderBy: { createdAt: 'asc' },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
			include: {
				developerProfile: { select: { name: true, slug: true } },
				requestedBy: { select: { name: true, email: true } }
			}
		}),
		db.developerVerificationRequest.count({ where: { status: 'PENDING' } })
	]);

	return {
		pendingVerifications,
		page,
		totalPages: pageCount(pendingTotal)
	};
};

export const actions: Actions = {
	approveVerification: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) return fail(400);

		const result = await approveDeveloperVerification(id, reviewer.id);
		if (!result.ok) return fail(400, { error: result.error });
	},

	rejectVerification: async ({ request, locals }) => {
		const reviewer = requireReviewer(locals.user);
		const data = await request.formData();
		const id = data.get('id') as string;
		const note = ((data.get('note') as string) ?? '').trim();
		if (!id) return fail(400);

		const result = await rejectDeveloperVerification(id, reviewer.id, note);
		if (!result.ok) return fail(400, { error: result.error });
	}
};
