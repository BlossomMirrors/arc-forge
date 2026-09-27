import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/authz';
import {
	cleanRunnerName,
	createRunner,
	deleteRunner,
	listRunners,
	regenerateRunnerToken,
	renameRunner,
	revokeRunnerToken
} from '$lib/server/runners/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);
	return listRunners();
};

async function runnerId(request: Request): Promise<{ id: string; data: FormData } | null> {
	const data = await request.formData();
	const id = data.get('id');
	return typeof id === 'string' && id ? { id, data } : null;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user);
		const name = cleanRunnerName((await request.formData()).get('name'));
		if (!name) return fail(400, { error: 'Enter a name' });
		return { issued: await createRunner(name, admin.id) };
	},

	rename: async ({ request, locals }) => {
		requireAdmin(locals.user);
		const input = await runnerId(request);
		const name = cleanRunnerName(input?.data.get('name') ?? null);
		if (!input || !name) return fail(400, { error: 'Enter a name' });
		await renameRunner(input.id, name);
	},

	revoke: async ({ request, locals }) => {
		requireAdmin(locals.user);
		const input = await runnerId(request);
		if (!input) return fail(400, { error: 'Missing runner' });
		await revokeRunnerToken(input.id);
	},

	regenerate: async ({ request, locals }) => {
		requireAdmin(locals.user);
		const input = await runnerId(request);
		if (!input) return fail(400, { error: 'Missing runner' });
		return { issued: await regenerateRunnerToken(input.id) };
	},

	delete: async ({ request, locals }) => {
		requireAdmin(locals.user);
		const input = await runnerId(request);
		if (!input) return fail(400, { error: 'Missing runner' });
		await deleteRunner(input.id);
	}
};
