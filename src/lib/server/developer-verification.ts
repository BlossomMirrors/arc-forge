import { db } from './db';
import { notifyReviewers, notifyUser } from './notifications';

export type RequestVerificationResult = { ok: false; error: string } | { ok: true; id: string };

// Only an owner/admin of the profile can file a request for it - same bar as
// inviting members (see developer-profile/+page.server.ts's invite action).
export async function requestDeveloperVerification(params: {
	userId: string;
	developerProfileId: string;
	dunsNumber: string;
	documentUrls: string[];
}): Promise<RequestVerificationResult> {
	const dunsNumber = params.dunsNumber.trim();
	if (!dunsNumber) return { ok: false, error: 'D-U-N-S number is required' };
	if (params.documentUrls.length === 0) {
		return { ok: false, error: 'Upload at least one supporting document' };
	}

	const membership = await db.developerProfileMember.findFirst({
		where: { userId: params.userId, developerProfileId: params.developerProfileId }
	});
	if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
		return { ok: false, error: 'Only an owner or admin can request verification' };
	}

	const profile = await db.developerProfile.findUnique({
		where: { id: params.developerProfileId }
	});
	if (!profile) return { ok: false, error: 'Developer profile not found' };
	if (profile.verified) return { ok: false, error: 'This profile is already verified' };

	const existingPending = await db.developerVerificationRequest.findFirst({
		where: { developerProfileId: params.developerProfileId, status: 'PENDING' }
	});
	if (existingPending) return { ok: false, error: 'A verification request is already pending' };

	const request = await db.developerVerificationRequest.create({
		data: {
			developerProfileId: params.developerProfileId,
			dunsNumber,
			documentUrls: params.documentUrls,
			requestedById: params.userId
		}
	});

	await notifyReviewers({
		type: 'dev_verification_pending',
		title: `${profile.name} requested developer verification`,
		link: '/dashboard/review'
	});

	return { ok: true, id: request.id };
}

export async function approveDeveloperVerification(
	requestId: string,
	reviewerId: string
): Promise<{ ok: boolean; error?: string }> {
	const request = await db.developerVerificationRequest.findUnique({
		where: { id: requestId },
		include: { developerProfile: true }
	});
	if (!request) return { ok: false, error: 'Request not found' };
	if (request.status !== 'PENDING') return { ok: false, error: 'Request already reviewed' };

	await db.$transaction([
		db.developerVerificationRequest.update({
			where: { id: requestId },
			data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() }
		}),
		db.developerProfile.update({
			where: { id: request.developerProfileId },
			data: { verified: true, verifiedById: reviewerId, verifiedAt: new Date() }
		})
	]);

	if (request.requestedById) {
		await notifyUser(request.requestedById, {
			type: 'dev_verification_approved',
			title: `${request.developerProfile.name} is now verified`,
			link: '/dashboard/developer-profile'
		});
	}
	return { ok: true };
}

export async function rejectDeveloperVerification(
	requestId: string,
	reviewerId: string,
	note: string
): Promise<{ ok: boolean; error?: string }> {
	const request = await db.developerVerificationRequest.findUnique({
		where: { id: requestId },
		include: { developerProfile: true }
	});
	if (!request) return { ok: false, error: 'Request not found' };
	if (request.status !== 'PENDING') return { ok: false, error: 'Request already reviewed' };

	await db.developerVerificationRequest.update({
		where: { id: requestId },
		data: {
			status: 'REJECTED',
			reviewedById: reviewerId,
			reviewedAt: new Date(),
			reviewNote: note || null
		}
	});

	if (request.requestedById) {
		await notifyUser(request.requestedById, {
			type: 'dev_verification_rejected',
			title: `Verification request for ${request.developerProfile.name} was rejected`,
			body: note || undefined,
			link: '/dashboard/developer-profile'
		});
	}
	return { ok: true };
}
