import { isReviewer, isStaff } from '$lib/server/authz';
import {
	getMyInstallsTimeseries,
	getMySubmissionStats,
	getReviewQueueStats,
	getReviewThroughput,
	getSiteInstallsTimeseries,
	getSiteStats
} from '$lib/server/dashboard-stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	const reviewer = isReviewer(user);
	const staff = isStaff(user);

	const [mySubmissions, myInstalls, reviewQueue, reviewThroughput, siteStats, siteInstalls] =
		await Promise.all([
			getMySubmissionStats(user.id),
			getMyInstallsTimeseries(user.id),
			reviewer ? getReviewQueueStats() : null,
			reviewer ? getReviewThroughput() : null,
			staff ? getSiteStats() : null,
			staff ? getSiteInstallsTimeseries() : null
		]);

	return {
		mySubmissions,
		myInstalls,
		reviewQueue,
		reviewThroughput,
		siteStats,
		siteInstalls
	};
};
