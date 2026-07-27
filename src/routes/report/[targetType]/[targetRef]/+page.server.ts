import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { parseTargetTypeParam, resolvePublicRef } from '$lib/server/reports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const targetType = parseTargetTypeParam(params.targetType);
	if (!targetType) throw error(404, 'Unknown report type');

	const target = await resolvePublicRef(targetType, params.targetRef);
	if (!target) throw error(404, 'Not found');

	return {
		targetType: params.targetType,
		targetRef: params.targetRef,
		target,
		siteKey: env.TURNSTILE_SITE_KEY ?? ''
	};
};
