import { db } from './db';

export type DayCount = { day: string; count: number };

// Prisma's groupBy can't bucket by day, and a JS-side reduce over raw rows
// would need to fetch every install row just to count them, so this buckets
// in Postgres directly. Missing days (no installs that day) are filled with 0
// afterward so charts get a continuous series instead of gaps.
function fillDays(rows: { day: Date; count: bigint | number }[], days: number): DayCount[] {
	const counts = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
	const result: DayCount[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setUTCHours(0, 0, 0, 0);
		d.setUTCDate(d.getUTCDate() - i);
		const key = d.toISOString().slice(0, 10);
		result.push({ day: key, count: counts.get(key) ?? 0 });
	}
	return result;
}

export type StatusCounts = Record<string, number>;

export async function getMySubmissionStats(userId: string) {
	const [pwaRows, flatpakRows] = await Promise.all([
		db.pwaApp.groupBy({ by: ['status'], where: { submittedById: userId }, _count: { id: true } }),
		db.flatpakApp.groupBy({
			by: ['status'],
			where: { submittedById: userId },
			_count: { id: true }
		})
	]);
	const pwaStatus: StatusCounts = Object.fromEntries(pwaRows.map((r) => [r.status, r._count.id]));
	const flatpakStatus: StatusCounts = Object.fromEntries(
		flatpakRows.map((r) => [r.status, r._count.id])
	);
	const pwaTotal = Object.values(pwaStatus).reduce((a, b) => a + b, 0);
	const flatpakTotal = Object.values(flatpakStatus).reduce((a, b) => a + b, 0);
	return { pwaStatus, flatpakStatus, pwaTotal, flatpakTotal };
}

export async function getMyInstallsTimeseries(userId: string, days = 14): Promise<DayCount[]> {
	const [pwas, flatpaks] = await Promise.all([
		db.pwaApp.findMany({ where: { submittedById: userId }, select: { appid: true } }),
		db.flatpakApp.findMany({ where: { submittedById: userId }, select: { appid: true } })
	]);
	const appids = [...pwas, ...flatpaks].map((a) => a.appid);
	if (appids.length === 0) return fillDays([], days);

	const since = new Date();
	since.setUTCHours(0, 0, 0, 0);
	since.setUTCDate(since.getUTCDate() - (days - 1));

	const rows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
		SELECT date_trunc('day', "createdAt") AS day, count(*) AS count
		FROM "AppInstall"
		WHERE appid = ANY(${appids}) AND "createdAt" >= ${since}
		GROUP BY day
		ORDER BY day
	`;
	return fillDays(rows, days);
}

export async function getReviewQueueStats() {
	const [pendingPwas, pendingFlatpaks, failedFlatpaks, pendingVerifications] = await Promise.all([
		db.pwaApp.count({ where: { status: 'PENDING' } }),
		db.flatpakApp.count({ where: { status: 'PENDING' } }),
		db.flatpakApp.count({ where: { status: 'FAILED' } }),
		db.developerVerificationRequest.count({ where: { status: 'PENDING' } })
	]);
	return { pendingPwas, pendingFlatpaks, failedFlatpaks, pendingVerifications };
}

export async function getReviewThroughput(
	days = 14
): Promise<{ day: string; approved: number; rejected: number }[]> {
	const since = new Date();
	since.setUTCHours(0, 0, 0, 0);
	since.setUTCDate(since.getUTCDate() - (days - 1));

	// PwaStatus and FlatpakStatus are distinct Postgres enum types, UNION needs a
	// common type on both sides of the status column or it refuses to combine them.
	const rows = await db.$queryRaw<{ day: Date; status: string; count: bigint }[]>`
		SELECT day, status, count(*) AS count FROM (
			SELECT date_trunc('day', "reviewedAt") AS day, status::text AS status FROM "PwaApp"
				WHERE "reviewedAt" >= ${since} AND status IN ('APPROVED', 'REJECTED')
			UNION ALL
			SELECT date_trunc('day', "reviewedAt") AS day, status::text AS status FROM "FlatpakApp"
				WHERE "reviewedAt" >= ${since} AND status IN ('APPROVED', 'REJECTED')
		) t
		GROUP BY day, status
		ORDER BY day
	`;

	const approved = new Map<string, number>();
	const rejected = new Map<string, number>();
	for (const r of rows) {
		const key = r.day.toISOString().slice(0, 10);
		(r.status === 'APPROVED' ? approved : rejected).set(key, Number(r.count));
	}

	const result: { day: string; approved: number; rejected: number }[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setUTCHours(0, 0, 0, 0);
		d.setUTCDate(d.getUTCDate() - i);
		const key = d.toISOString().slice(0, 10);
		result.push({ day: key, approved: approved.get(key) ?? 0, rejected: rejected.get(key) ?? 0 });
	}
	return result;
}

export async function getSiteStats() {
	const [pwaCount, flatpakCount, developerProfileCount, totalInstalls] = await Promise.all([
		db.pwaApp.count(),
		db.flatpakApp.count(),
		db.developerProfile.count(),
		db.appInstall.count()
	]);
	return { pwaCount, flatpakCount, developerProfileCount, totalInstalls };
}

export async function getSiteInstallsTimeseries(days = 30): Promise<DayCount[]> {
	const since = new Date();
	since.setUTCHours(0, 0, 0, 0);
	since.setUTCDate(since.getUTCDate() - (days - 1));

	const rows = await db.$queryRaw<{ day: Date; count: bigint }[]>`
		SELECT date_trunc('day', "createdAt") AS day, count(*) AS count
		FROM "AppInstall"
		WHERE "createdAt" >= ${since}
		GROUP BY day
		ORDER BY day
	`;
	return fillDays(rows, days);
}
