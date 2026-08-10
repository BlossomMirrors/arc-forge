import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

// Public, unauthenticated: lets any client (the Arc app, third-party tooling, etc.)
// check whether a Flatpak's developer has been verified by a reviewer. A
// staff-submitted Flatpak has no developer profile behind it at all and is always
// treated as verified (see DeveloperProfile.verified's schema comment and
// /dashboard/verified-developers for where the flag itself gets set/revoked).
export const GET: RequestHandler = async ({ params }) => {
	// appid alone isn't unique anymore (see FlatpakApp.appid schema comment) - a
	// style/theme extension can have several branches under the same appid, all
	// submitted by the same developer profile, so any matching row answers the
	// same verified question.
	const app = await db.flatpakApp.findFirst({
		where: { appid: params.appid },
		select: {
			appid: true,
			developerProfileId: true,
			developerProfile: { select: { verified: true } }
		}
	});
	if (!app) return new Response('Not Found', { status: 404 });

	const verified = !app.developerProfileId || (app.developerProfile?.verified ?? false);

	return Response.json({ appid: app.appid, verified });
};
