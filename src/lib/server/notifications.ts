import { env } from '$env/dynamic/private';
import { db } from './db';
import { STAFF_ROLE, REVIEWER_ROLE } from './authz';
import { sendEmail, renderNotificationEmail } from './email';

type NotificationInput = {
	type: string;
	title: string;
	body?: string;
	link?: string;
};

// Every email links back to Forge, either the specific notification's own link
// (approvals, reviews, etc.) or, failing that, just the dashboard root - never no
// link at all.
function emailNotification(email: string, data: NotificationInput): Promise<void> {
	const base = env.BETTER_AUTH_URL;
	const linkUrl = base ? new URL(data.link || '/dashboard', base).href : undefined;
	return sendEmail({
		to: email,
		subject: data.title,
		html: renderNotificationEmail({ title: data.title, body: data.body, linkUrl })
	});
}

export async function notifyUser(userId: string, data: NotificationInput): Promise<void> {
	const [user] = await Promise.all([
		db.user.findUnique({
			where: { id: userId },
			select: { email: true, emailNotificationsEnabled: true }
		}),
		db.notification.create({ data: { userId, ...data } })
	]);
	if (user?.email && user.emailNotificationsEnabled) await emailNotification(user.email, data);
}

export async function notifyReviewers(data: NotificationInput): Promise<void> {
	const reviewers = await db.user.findMany({
		where: { roles: { hasSome: [STAFF_ROLE, REVIEWER_ROLE] } },
		select: { id: true, email: true, emailNotificationsEnabled: true }
	});
	if (!reviewers.length) return;
	await db.notification.createMany({
		data: reviewers.map((r) => ({ userId: r.id, ...data }))
	});
	await Promise.all(
		reviewers
			.filter((r) => r.emailNotificationsEnabled)
			.map((r) => emailNotification(r.email, data))
	);
}

export async function listNotifications(userId: string, limit = 50) {
	return db.notification.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		take: limit
	});
}

export async function unreadNotificationCount(userId: string): Promise<number> {
	return db.notification.count({ where: { userId, read: false } });
}

// Scoped by userId in the query itself so a user can only ever mark their own
// notifications read, regardless of what id is passed in.
export async function markNotificationRead(userId: string, id: string): Promise<void> {
	await db.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
	await db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

// Scoped by userId in the query itself, same as markNotificationRead - a user can
// only ever delete their own notifications.
export async function deleteNotification(userId: string, id: string): Promise<void> {
	await db.notification.deleteMany({ where: { id, userId } });
}

export async function deleteAllNotifications(userId: string): Promise<void> {
	await db.notification.deleteMany({ where: { userId } });
}
