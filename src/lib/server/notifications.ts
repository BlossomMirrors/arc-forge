import { db } from './db';
import { STAFF_ROLE, REVIEWER_ROLE } from './authz';

type NotificationInput = {
	type: string;
	title: string;
	body?: string;
	link?: string;
};

export async function notifyUser(userId: string, data: NotificationInput): Promise<void> {
	await db.notification.create({ data: { userId, ...data } });
}

export async function notifyReviewers(data: NotificationInput): Promise<void> {
	const reviewers = await db.user.findMany({
		where: { roles: { hasSome: [STAFF_ROLE, REVIEWER_ROLE] } },
		select: { id: true }
	});
	if (!reviewers.length) return;
	await db.notification.createMany({
		data: reviewers.map((r) => ({ userId: r.id, ...data }))
	});
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
