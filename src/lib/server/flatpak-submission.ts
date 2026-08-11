import { db } from './db';
import { uploadFile } from './r2';
import { extractAppstreamMetadata, iconFileExtension } from './flatpak-publish';
import { checkRemoteHead, readManifestAppId } from './git-watch';
import { scanForMalware } from './malware-scan';

export type FlatpakSubmissionResult =
	| { ok: false; error: string; log?: string }
	| {
			ok: true;
			appid: string;
			branch: string;
			name: string;
			summary: string;
			description: string;
			developerName: string;
			iconUrl: string;
			screenshots: string[];
			homepageUrl: string;
			contentRating: string;
			status: 'PENDING' | 'REJECTED';
			reviewNote: string | null;
			gitLastCommit?: string;
	  };

export type FlatpakSource =
	| { kind: 'bundle'; bundleUrl: string }
	| { kind: 'git'; gitUrl: string; gitBranch: string; gitManifestPath: string };

export const AUTO_REJECT_DEVELOPER_MISMATCH =
	"Auto-rejected: developer profile name mismatch. Check your Flatpak's AppStream metadata.";
export const AUTO_REJECT_MALWARE = 'Auto-rejected: malware detected';

// Shared by the new-submission and edit/resubmit actions. For a bundle, reads its
// own real AppStream data (see extractAppstreamMetadata) instead of trusting
// free-text form fields, and, unless the submitter is staff, auto-rejects if the
// bundle's own declared developer name doesn't match the developer profile it's
// being submitted under. For a git repo there's no AppStream data to read until a
// build actually produces one (see updateDisplayDataFromSidecars in
// flatpak-publish.ts), so this only validates the manifest is reachable and
// declares an app id - display fields start as placeholders, and there's no
// mismatch check to run yet. That's an acceptable gap here specifically because
// every push for a git-sourced app always goes back through manual review (see
// git-watch.ts), unlike a bundle which could otherwise reach APPROVED without a
// human ever looking at it.
export async function resolveFlatpakSubmission(params: {
	source: FlatpakSource;
	isStaff: boolean;
	claimedDeveloperName?: string;
	existingAppId?: string;
}): Promise<FlatpakSubmissionResult> {
	if (params.source.kind === 'git') {
		return resolveGitSubmission(params.source, params);
	}
	return resolveBundleSubmission(params.source.bundleUrl, params);
}

async function resolveGitSubmission(
	source: { gitUrl: string; gitBranch: string; gitManifestPath: string },
	params: { isStaff: boolean; claimedDeveloperName?: string; existingAppId?: string }
): Promise<FlatpakSubmissionResult> {
	const { appid, error } = await readManifestAppId(
		source.gitUrl,
		source.gitBranch,
		source.gitManifestPath
	);
	if (!appid) {
		return {
			ok: false,
			error:
				error ??
				'Could not read an app id from that manifest - check the repo URL, branch, and manifest path'
		};
	}

	if (params.existingAppId && appid !== params.existingAppId) {
		return {
			ok: false,
			error: `That manifest is for ${appid}, but this submission is for ${params.existingAppId}. Submit a new Flatpak instead.`
		};
	}

	if (!params.existingAppId) {
		// Flatpak branch, not source.gitBranch (the git repo branch) - a
		// git-sourced submission always resolves to the 'stable' Flatpak branch,
		// see the returned object below.
		const duplicate = await db.flatpakApp.findUnique({
			where: { appid_branch: { appid, branch: 'stable' } }
		});
		if (duplicate) {
			return { ok: false, error: `An app with id ${appid} has already been submitted` };
		}
	}

	const gitLastCommit = (await checkRemoteHead(source.gitUrl, source.gitBranch)) ?? undefined;

	return {
		ok: true,
		appid,
		branch: 'stable',
		name: appid,
		summary: '',
		description: '',
		developerName: (params.claimedDeveloperName ?? '').trim(),
		iconUrl: '',
		screenshots: [],
		homepageUrl: '',
		contentRating: 'All ages',
		status: 'PENDING',
		reviewNote: null,
		gitLastCommit
	};
}

async function resolveBundleSubmission(
	bundleUrl: string,
	params: { isStaff: boolean; claimedDeveloperName?: string; existingAppId?: string }
): Promise<FlatpakSubmissionResult> {
	const extracted = await extractAppstreamMetadata(bundleUrl);
	if (!extracted.ok || !extracted.appid) {
		return {
			ok: false,
			error: extracted.error ?? 'Could not read AppStream metadata from the uploaded bundle',
			log: extracted.log
		};
	}

	if (params.existingAppId && extracted.appid !== params.existingAppId) {
		return {
			ok: false,
			error: `Uploaded bundle is for ${extracted.appid}, but this submission is for ${params.existingAppId}. Submit a new Flatpak instead.`
		};
	}

	const branch = extracted.branch ?? 'stable';

	if (!params.existingAppId) {
		// Same appid at a different branch is a distinct, legitimate submission
		// (see the FlatpakApp.appid schema comment) - only reject an exact
		// appid+branch repeat.
		const duplicate = await db.flatpakApp.findUnique({
			where: { appid_branch: { appid: extracted.appid, branch } }
		});
		if (duplicate) {
			return {
				ok: false,
				error: `An app with id ${extracted.appid} at branch ${branch} has already been submitted`
			};
		}
	}

	// Applies to every submitter, staff included - unlike the developer-name check
	// below, being staff doesn't make a bundle any less capable of carrying malware.
	// A scan that can't actually complete (missing API key, network issue, timeout)
	// blocks the submission with a clear error rather than either silently letting an
	// unscanned bundle through or falsely reporting malware that was never confirmed.
	const scan = await scanForMalware(bundleUrl);
	if (!scan.ok) {
		return { ok: false, error: `Could not complete a malware scan of your bundle: ${scan.error}` };
	}

	// A bundle with no application icon (common for runtimes/themes, which have no
	// files/share/icons/hicolor/*/apps/*.png of their own) still gets submitted,
	// just with a generic placeholder instead of blocking the submission outright.
	let iconUrl = '/default.svg';
	if (extracted.iconBuffer) {
		const iconArrayBuffer = extracted.iconBuffer.buffer.slice(
			extracted.iconBuffer.byteOffset,
			extracted.iconBuffer.byteOffset + extracted.iconBuffer.byteLength
		) as ArrayBuffer;
		iconUrl = await uploadFile(
			iconArrayBuffer,
			`${crypto.randomUUID()}.${iconFileExtension(extracted.iconBuffer)}`
		);
	}

	let status: 'PENDING' | 'REJECTED' = 'PENDING';
	// Independent of the reject-reason branch below: a skipped scan doesn't reject
	// the submission on its own, it just needs to stay visible to whoever reviews it.
	const notes: string[] = scan.skippedReason ? [scan.skippedReason] : [];
	const declaredDeveloperName = (extracted.developerName ?? '').trim();
	if (scan.infected) {
		status = 'REJECTED';
		notes.push(AUTO_REJECT_MALWARE);
	} else if (
		!params.isStaff &&
		declaredDeveloperName &&
		declaredDeveloperName.toLowerCase() !== (params.claimedDeveloperName ?? '').trim().toLowerCase()
	) {
		status = 'REJECTED';
		notes.push(AUTO_REJECT_DEVELOPER_MISMATCH);
	}
	const reviewNote = notes.length > 0 ? notes.join(' ') : null;

	return {
		ok: true,
		appid: extracted.appid,
		branch,
		name: extracted.name || extracted.appid,
		summary: extracted.summary ?? '',
		description: extracted.description ?? '',
		developerName: declaredDeveloperName,
		iconUrl,
		screenshots: extracted.screenshots ?? [],
		homepageUrl: extracted.homepageUrl ?? '',
		contentRating: 'All ages',
		status,
		reviewNote
	};
}
