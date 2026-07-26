import {
	listNotifications,
	unreadNotificationCount,
	markNotificationRead,
	markAllNotificationsRead,
	deleteNotification,
	deleteAllNotifications
} from '$lib/server/notifications';
import type { RequestHandler } from './$types';

// Not a form action because the notification center appears in the shared dashboard
// layout, not any single page, form actions only exist per +page.server.ts.

// Polled by the notification center for auto-refresh (see notification-center.svelte).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const [notifications, unreadCount] = await Promise.all([
		listNotifications(locals.user.id),
		unreadNotificationCount(locals.user.id)
	]);
	return Response.json({ notifications, unreadCount });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const id = (body as Record<string, unknown>)?.id;

	if (typeof id === 'string') {
		await markNotificationRead(locals.user.id, id);
	} else {
		await markAllNotificationsRead(locals.user.id);
	}
	return Response.json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const id = (body as Record<string, unknown>)?.id;
	const all = (body as Record<string, unknown>)?.all === true;

	if (all) {
		await deleteAllNotifications(locals.user.id);
	} else if (typeof id === 'string') {
		await deleteNotification(locals.user.id, id);
	} else {
		return new Response('Bad Request', { status: 400 });
	}
	return Response.json({ ok: true });
};
