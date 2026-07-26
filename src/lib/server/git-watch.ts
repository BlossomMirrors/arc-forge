import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from './db';
import { notifyReviewers } from './notifications';

const execFileAsync = promisify(execFile);

// Turns a failed execFile('git', ...) call into a short, human-readable reason
// instead of swallowing it, so a broken clone (missing git binary, no network
// egress to the remote, bad credentials, wrong branch, ...) shows up as an actual
// diagnosable message instead of a bare "not found" that looks like the repo/path
// was simply wrong.
function gitErrorMessage(e: unknown): string {
	if (e && typeof e === 'object') {
		const err = e as { code?: string; killed?: boolean; stderr?: string; message?: string };
		if (err.code === 'ENOENT') return 'git is not installed on the server';
		if (err.killed) return 'git command timed out';
		const stderr = err.stderr?.trim();
		if (stderr) return stderr.split('\n').pop() || stderr;
		if (err.message) return err.message;
	}
	return String(e);
}

// Read-only check of a repo's current branch head - deliberately run from Forge's
// own process (not over SSH to the signing host), since it has nothing to do with
// secrets and would otherwise burn an SSH round-trip per watched app per poll tick.
export async function checkRemoteHead(gitUrl: string, branch: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync('git', ['ls-remote', gitUrl, `refs/heads/${branch}`], {
			timeout: 20000
		});
		const sha = stdout.split(/\s+/)[0]?.trim();
		return sha || null;
	} catch (e) {
		console.error(`git ls-remote failed for ${gitUrl}#${branch}:`, gitErrorMessage(e));
		return null;
	}
}

const MANIFEST_EXTENSIONS = new Set(['.json', '.yml', '.yaml']);

// Very loose heuristic: flatpak-builder manifests always declare an app id (the
// modern key is "app-id", flatpak-builder still also accepts the legacy "id") and
// a modules list, in either JSON or YAML - good enough to prefill a form field
// for the submitter to confirm, not meant to be authoritative.
function looksLikeManifest(content: string): boolean {
	return /["']?(app-id|id)["']?\s*:/.test(content) && /["']?modules["']?\s*:/.test(content);
}

// Best-effort: shallow-clones the repo to a scratch dir and scans the top level for
// a file that looks like a flatpak-builder manifest, returning its path relative to
// the repo root. The submitter still has to confirm/enter the path themselves, this
// only prefills the field. Distinguishes "cloned fine, nothing matched" (manifestPath
// null, no error) from "couldn't even clone the repo" (error set) - collapsing both
// into the same silent null previously made a broken git binary or unreachable
// remote look identical to the repo genuinely having no manifest at the top level.
export async function detectManifestPath(
	gitUrl: string,
	branch: string
): Promise<{ manifestPath: string | null; error?: string }> {
	const dir = await mkdtemp(path.join(tmpdir(), 'forge-manifest-'));
	try {
		await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, gitUrl, dir], {
			timeout: 60000
		});
		const entries = await readdir(dir);
		for (const entry of entries) {
			if (!MANIFEST_EXTENSIONS.has(path.extname(entry))) continue;
			const content = await readFile(path.join(dir, entry), 'utf8').catch(() => '');
			if (looksLikeManifest(content)) return { manifestPath: entry };
		}
		return { manifestPath: null };
	} catch (e) {
		const error = gitErrorMessage(e);
		console.error(`git clone failed for ${gitUrl}#${branch}:`, error);
		return { manifestPath: null, error };
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

function parseManifestAppId(content: string): string | null {
	try {
		const json = JSON.parse(content) as Record<string, unknown>;
		const id = json['app-id'] ?? json['id'];
		return typeof id === 'string' ? id : null;
	} catch {
		// Not JSON - assume YAML. A full YAML parser is overkill just to pull one
		// top-level scalar field back out.
		const m = content.match(/^(?:app-id|id):\s*["']?([\w.-]+)["']?/m);
		return m?.[1] ?? null;
	}
}

// Validates that manifestPath actually exists in the repo and declares an app id,
// returning that id. Used at submission time - unlike detectManifestPath this takes
// an authoritative, submitter-provided path rather than guessing one. Distinguishes
// "cloned fine, path/app-id missing" (appid null, no error) from "couldn't clone or
// read at all" (error set) for the same reason detectManifestPath does.
export async function readManifestAppId(
	gitUrl: string,
	branch: string,
	manifestPath: string
): Promise<{ appid: string | null; error?: string }> {
	const dir = await mkdtemp(path.join(tmpdir(), 'forge-manifest-'));
	try {
		await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, gitUrl, dir], {
			timeout: 60000
		});
		let content: string;
		try {
			content = await readFile(path.join(dir, manifestPath), 'utf8');
		} catch {
			return { appid: null, error: `No file at "${manifestPath}" in the repo` };
		}
		return { appid: parseManifestAppId(content) };
	} catch (e) {
		const error = gitErrorMessage(e);
		console.error(`git clone failed for ${gitUrl}#${branch}:`, error);
		return { appid: null, error };
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let watcherStarted = false;

// Polls every live (APPROVED) git-sourced app for new commits on its tracked
// branch. A new commit always flips the app back to PENDING and notifies
// reviewers - staff included, since approving a Flatpak always triggers a real
// build+publish against production and that always needs an explicit review
// click (see review/+page.server.ts's approveFlatpak). PENDING/FAILED/REJECTED/
// PULLED apps are left alone: PENDING is already queued for review, and the
// others are states a human deliberately put the app into, not something a new
// commit should silently override.
export function startGitWatcher(): void {
	if (watcherStarted) return;
	watcherStarted = true;
	setInterval(() => {
		pollOnce().catch((e) => console.error('git watcher poll failed', e));
	}, POLL_INTERVAL_MS);
}

async function pollOnce(): Promise<void> {
	const apps = await db.flatpakApp.findMany({
		where: {
			sourceType: 'GIT',
			status: 'APPROVED',
			gitUrl: { not: null },
			gitBranch: { not: null }
		}
	});

	for (const app of apps) {
		if (!app.gitUrl || !app.gitBranch) continue;
		const head = await checkRemoteHead(app.gitUrl, app.gitBranch);
		if (!head || head === app.gitLastCommit) continue;

		await db.flatpakApp.update({
			where: { id: app.id },
			data: {
				status: 'PENDING',
				gitLastCommit: head,
				reviewedById: null,
				reviewedAt: null,
				reviewNote: null
			}
		});
		await notifyReviewers({
			type: 'flatpak_pending',
			title: `New commit on ${app.name}, awaiting review`,
			link: '/dashboard/review'
		});
	}
}
