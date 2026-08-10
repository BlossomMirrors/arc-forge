// deno-lint-ignore-file no-sloppy-imports
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, rm, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { db } from './db';
import { decryptSecret } from './secrets';
import { notifyUser } from './notifications';
import { uploadFile } from './r2';
import type { FlatpakApp } from '$lib/generated/prisma/client';

const execFileAsync = promisify(execFile);

// Build+sign+publish all happen as plain subprocesses of Forge's own server
// process, in Forge's own container - no separate builder container, no
// docker.sock, no `docker exec`. This container already IS the isolation
// boundary; see docker-compose.yml's `privileged: true` and the Dockerfile
// for what that now costs (flatpak-builder's bwrap sandbox needs it, and
// it's the same container serving public HTTP traffic - a real trade-off,
// see README.md). `/repo` is a real local filesystem (a Hetzner Volume, not
// R2/rclone-FUSE-mounted - OSTree's commit writes rely on hardlinks, which
// rclone's FUSE mount can't provide, a real reproduced `renameat`/`linkat`
// EPERM confirmed this). Forge itself serves this same mount directly to
// Flatpak clients (see src/routes/flatpak/[...path]/+server.ts) - no R2/CDN
// involved at all anymore, that bucket holds unrelated content (RPMs) this
// repo can't share a domain with.
const CONTAINER_REPO_PATH = '/repo';
// Per-run scratch space (scripts, GPG passphrase/key files, build logs) - a
// plain local directory, created on demand. Nothing here needs to be shared
// with another container anymore.
const SCRATCH_ROOT = '/tmp/forge-flatpak';

// Fires the given bash command as a fully independent process (`detached:
// true` + `unref()`, the Node equivalent of the old `screen -dmS`) and
// returns immediately - the command keeps running independent of this
// specific call, this Node process restarting, or this function's own
// return. Survives a Forge code-level restart; does not survive the whole
// container being recreated (see the module doc comment above for that
// trade-off). Used for the actual (potentially long) build+sign+publish run
// - see launchDetachedRun.
function runDetached(command: string): { ok: boolean; log: string } {
	try {
		const child = spawn('bash', ['-c', command], { detached: true, stdio: 'ignore' });
		child.on('error', (e) => console.error('Detached build process failed to start:', e));
		child.unref();
		return { ok: true, log: '' };
	} catch (e) {
		return { ok: false, log: e instanceof Error ? e.message : String(e) };
	}
}

// Runs a script and waits for it to finish, piping `stdin` in (the GPG
// passphrase - see runOnBuilder). Only for short/synchronous scripts
// (repair, unpublish, appstream extraction) - never for the detached publish
// run, which would otherwise tie up this Node process for as long as the
// build takes.
function runPiped(scriptPath: string, stdin: string): Promise<{ exitCode: number; log: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', [scriptPath]);
		let log = '';
		child.stdout.on('data', (chunk: Buffer) => {
			log += chunk.toString('utf8');
		});
		child.stderr.on('data', (chunk: Buffer) => {
			log += chunk.toString('utf8');
		});
		child.on('error', reject);
		child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, log }));
		child.stdin.end(`${stdin}\n`);
	});
}

// Writes to the scratch directory - creates the run's directory on first
// write. mode matters here same as it did over SFTP (0600 for secrets like
// the GPG passphrase/key, 0700 for the executable script itself).
async function writeScratchFile(path: string, contents: string, mode = 0o600): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents, { mode });
}

async function readScratchFileOrEmpty(path: string): Promise<string> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return '';
	}
}

// Replicates `tail -c maxBytes` without reading a potentially large,
// still-growing log file in full on every poll tick - see LOG_READ_BYTES.
async function tailFile(path: string, maxBytes: number): Promise<string> {
	let handle;
	try {
		handle = await open(path, 'r');
		const { size } = await handle.stat();
		const start = Math.max(0, size - maxBytes);
		const length = size - start;
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, start);
		return buffer.toString('utf8');
	} catch {
		return '';
	} finally {
		await handle?.close();
	}
}

// Builds the full publish pipeline as a single self-deleting script. The GPG key ID is
// derived dynamically at run time (matching the user's existing tooling)
// rather than stored anywhere. Deliberately does NOT force-delete the appstream2/x86_64 ref
// before regenerating: that's a manual repair step for when the branch is already
// broken, not something to run on every routine publish, doing it unconditionally
// disconnects the ref's history from what existing clients have cached, which can
// surface as a static-delta checksum mismatch on their next pull.
//
// Deliberately does NOT check out the tree and inject/overwrite any metainfo.xml or
// app-info/xmls fragment of its own anymore. That used to be necessary because Forge's
// web form collected name/summary/icon/etc as free text with no relation to what was
// actually inside the bundle, so something had to write real AppStream data into the
// tree. Now that submission (see extractAppstreamMetadata below) reads the bundle's
// OWN real AppStream data instead of asking the developer to retype it, that data is
// already correct and already in the tree from build-import-bundle, overwriting it
// only risked leaving stale, inconsistent leftovers (e.g. a real bundle's own
// `files/share/app-info/icons/flatpak/*` icon cache, generated by the developer's own
// `appstreamcli compose` step, sitting orphaned next to a hand-written xml.gz that no
// longer referenced it) without actually fixing anything. Publishing is now just:
// validate in staging, copy the untouched commit into the shared repo, and let
// build-update-repo compose the aggregate catalog from what's really there.

// Imports the admin-uploaded signing key fresh on every run and resolves its
// fingerprint straight from the key file itself (via --import-options
// show-only, which doesn't touch the keyring), rather than by listing
// whatever secret keys the local keyring happens to already have. That "just
// list secret keys and take the first one" approach is what silently signed
// everything with the wrong key once the keyring ever held more than one -
// see the incident this replaced. Requires $GPG_PASSPHRASE to already be set
// (each caller reads its own passphrase differently, see
// buildPublishScript/buildRepairScript/buildUnpublishScript). Re-importing
// the same key on every run (this container's own keyring is long-lived, not
// disposable per run) is idempotent and harmless.
function buildGpgImportSection(gpgKeyPath: string): string {
	return `GPG_ID=$(gpg --batch --with-colons --import-options show-only --import "${gpgKeyPath}" 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')
if [ -z "$GPG_ID" ]; then
  echo "Could not read a fingerprint from the configured GPG signing key" >&2
  exit 1
fi
gpg --batch --import "${gpgKeyPath}"
KEYGRIP=$(gpg --with-keygrip -K "$GPG_ID" | awk '/Keygrip/ {print $3; exit}')
if [ -n "$GPG_PASSPHRASE" ]; then
  $(gpgconf --list-dirs libexecdir)/gpg-preset-passphrase --preset "$KEYGRIP" <<< "$GPG_PASSPHRASE"
fi`;
}

// Neither source type stages anymore (explicit user decision) - both
// build/import straight into $REPO_PATH (now a real local filesystem, see
// CONTAINER_REPO_PATH above). Bundles are self-describing (build-import-bundle
// always imports under the bundle's OWN embedded appid/branch, regardless of
// what the submission declared) and a manifest could equally drift from its
// submission's declared appid - a mismatch on either path now leaves a real,
// signed commit sitting in the shared repo with nothing to clean it up,
// swept into every later aggregate appstream2 rebuild. Mandatory human
// review before approval is the only guard against that now, same posture as
// the GIT-manifest security note in README.md. See flatpak_publish_pipeline
// memory for the real, reproduced corruption incident (a submission
// declaring `com.koyu.test` whose bundle was actually Hytale Launcher) that
// originally motivated staging.
interface BuildSidecarPaths {
	commitPath: string;
	metainfoPath: string;
	iconPath: string;
}

// Curls the developer's uploaded bundle straight into $WORKDIR (the script's
// own mktemp'd cwd - see buildPublishScript) and imports it directly into
// $REPO_PATH.
function buildBundleImportSection(app: FlatpakApp): string {
	return `
BUNDLE_URL="${app.bundleUrl}"

curl -fsSL "$BUNDLE_URL" -o bundle.flatpak

flatpak build-import-bundle --gpg-sign="$GPG_ID" "$REPO_PATH" bundle.flatpak
`;
}

// GIT submissions: builds AND signs directly into $REPO_PATH, same as the
// user's own pre-Forge command (`flatpak-builder --gpg-sign=...
// --repo=/srv/repos/flatpak build-dir`), just now writing into a real local
// disk (a Hetzner Volume) instead of `/srv/repos/flatpak` directly.
// --state-dir explicitly under $WORKDIR since flatpak-builder refuses to run
// when its cache dir and target dir are on different filesystems;
// --disable-rofiles-fuse since FUSE may not be available in the container
// (same lesson as ostree checkout's -U flag below). Resolves $REF straight
// out of $REPO_PATH afterward - not a pre-publish validation gate anymore
// (see the interface comment above), just finding what was actually built so
// buildGitExtractionSection knows what to check out. That extraction is
// copied over from the old build-host container script's tail: this
// appid-scoping (never a bare glob) was a real, reproduced production bug
// fix (a base app/SDK/module's own metainfo/icon could otherwise be picked
// instead of the submitted app's, e.g. a bundled QEMU module's qemu.png) -
// see flatpak_publish_pipeline memory.
function buildGitBuildSection(): string {
	return `
flatpak-builder --repo="$REPO_PATH" --gpg-sign="$GPG_ID" --state-dir="$WORKDIR/.flatpak-builder" \\
  --force-clean --disable-rofiles-fuse --install-deps-from=flathub \\
  "$WORKDIR/build-dir" "$WORKDIR/src/$MANIFEST_PATH"

REF=$(ostree refs --repo="$REPO_PATH" | grep "^app/$APPID/" | head -n1)
if [ -z "$REF" ]; then
  # Themes/extensions publish as a runtime rather than an app.
  REF=$(ostree refs --repo="$REPO_PATH" | grep "^runtime/$APPID/" | head -n1)
fi
if [ -z "$REF" ]; then
  echo "Could not find a matching app or runtime ref for $APPID after building (appid/branch mismatch, or the build didn't produce a ref)" >&2
  exit 1
fi

${buildGitExtractionSection()}
`;
}

// checkout MUST come before creating any subdirectories under the
// destination and needs -U/--user-mode, same as everywhere else this file
// does an ostree checkout.
//
// export/share/app-info/icons/flatpak/{size}/$APPID.png is checked first:
// flatpak-builder's own per-app export already runs appstreamcli compose,
// which resolves a manifest's declared icon (name-vs-appid mismatches,
// looking up whatever the .desktop file's Icon= key actually says) AND
// rasterizes an SVG-only icon into a real PNG - both problems the plain
// files/share/icons/hicolor/*/apps/ lookup below can't handle on its own. A
// real, reproduced case: io.github.shyvortex.BraveOrigin only ships an SVG
// there at all, no raster PNG at any size - compose already solved exactly
// this, reusing its output beats re-deriving the same resolution by hand.
function buildGitExtractionSection(): string {
	return `
ostree checkout -U --repo="$REPO_PATH" "$REF" post-build-checkout
METAINFO_SRC=$(find post-build-checkout/files/share/metainfo post-build-checkout/export/share/metainfo -maxdepth 1 \\( -name "$APPID.metainfo.xml" -o -name "$APPID.appdata.xml" \\) 2>/dev/null | head -n1 || true)
if [ -n "$METAINFO_SRC" ]; then
  base64 -w0 "$METAINFO_SRC" > "$METAINFO_PATH"
fi
ICON_SRC=$(ls post-build-checkout/export/share/app-info/icons/flatpak/128x128/"$APPID".png \\
  post-build-checkout/export/share/app-info/icons/flatpak/64x64/"$APPID".png \\
  post-build-checkout/files/share/icons/hicolor/256x256/apps/"$APPID".png \\
  post-build-checkout/files/share/icons/hicolor/128x128/apps/"$APPID".png \\
  post-build-checkout/files/share/icons/hicolor/64x64/apps/"$APPID".png \\
  post-build-checkout/files/share/icons/hicolor/48x48/apps/"$APPID".png \\
  post-build-checkout/files/share/icons/hicolor/scalable/apps/"$APPID".svg \\
  post-build-checkout/files/share/icons/hicolor/scalable/apps/"$APPID".png 2>/dev/null | head -n1 || true)
if [ -n "$ICON_SRC" ]; then
  base64 -w0 "$ICON_SRC" > "$ICON_PATH"
fi
`;
}

interface RunPaths extends BuildSidecarPaths {
	runDir: string;
	scriptPath: string;
	logPath: string;
	exitPath: string;
	passphrasePath: string;
	gpgKeyPath: string;
}

function sidecarPathsFromRunDir(runDir: string): BuildSidecarPaths {
	return {
		commitPath: `${runDir}/commit`,
		metainfoPath: `${runDir}/metainfo.b64`,
		iconPath: `${runDir}/icon.b64`
	};
}

// Minted once per publish run - a fresh, uniquely-named subdirectory under
// the shared scratch volume.
function buildRunPaths(appId: string): RunPaths {
	const runDir = `${SCRATCH_ROOT}/run-${appId}-${Date.now()}`;
	return {
		runDir,
		scriptPath: `${runDir}/script.sh`,
		logPath: `${runDir}/log`,
		exitPath: `${runDir}/exit`,
		passphrasePath: `${runDir}/pass`,
		gpgKeyPath: `${runDir}/gpgkey`,
		...sidecarPathsFromRunDir(runDir)
	};
}

// The full per-run script: GPG import -> (GIT clone+build | BUNDLE curl+import)
// -> build-update-repo, all in one file that gets launched detached (see
// launchDetachedRun). $WORKDIR is a plain mktemp'd directory - it doesn't
// need to be under SCRATCH_ROOT, nothing outside this script ever needs to
// read it, only $REPO_PATH's result and the sidecar files under
// paths.runDir do.
function buildPublishScript(app: FlatpakApp, paths: RunPaths): string {
	const isGit = app.sourceType === 'GIT';
	const gitCloneSection = isGit
		? `
git clone --recurse-submodules --branch "${app.gitBranch}" --depth 1 "${app.gitUrl}" "$WORKDIR/src"
git -C "$WORKDIR/src" rev-parse HEAD > "${paths.commitPath}"
`
		: '';
	const gitVars = isGit
		? `
MANIFEST_PATH="${app.gitManifestPath}"
METAINFO_PATH="${paths.metainfoPath}"
ICON_PATH="${paths.iconPath}"`
		: '';
	const body = isGit ? buildGitBuildSection() : buildBundleImportSection(app);

	return `#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "$0" "${paths.passphrasePath}" "${paths.gpgKeyPath}"; [ -n "\${WORKDIR:-}" ] && rm -rf "$WORKDIR"' EXIT

WORKDIR=$(mktemp -d)
cd "$WORKDIR"

GPG_PASSPHRASE=$(cat "${paths.passphrasePath}")
APPID="${app.appid}"
REPO_PATH="${CONTAINER_REPO_PATH}"${gitVars}

${buildGpgImportSection(paths.gpgKeyPath)}
${gitCloneSection}
${body}

flatpak build-update-repo \\
  --gpg-sign="$GPG_ID" \\
  --prune \\
  --generate-static-deltas \\
  --verbose \\
  "$REPO_PATH"
`;
}

// Writes the script (plus any extra small files it needs, e.g. a GPG
// passphrase/key) to the scratch directory and fires it detached - see
// pollBuildOnce for how its outcome is picked back up. Runs independent of
// this Node process or Forge restarting (see runDetached).
async function launchDetachedRun(
	paths: RunPaths,
	script: string,
	extraFiles: { path: string; contents: string; mode?: number }[] = []
): Promise<{ ok: boolean; log: string }> {
	try {
		await writeScratchFile(paths.scriptPath, script, 0o700);
		for (const f of extraFiles) {
			await writeScratchFile(f.path, f.contents, f.mode ?? 0o600);
		}
		const { ok, log } = runDetached(
			`bash "${paths.scriptPath}" > "${paths.logPath}" 2>&1; echo $? > "${paths.exitPath}"`
		);
		if (!ok) return { ok: false, log: `Failed to launch detached build: ${log}` };
		return { ok: true, log: '' };
	} catch (e) {
		return { ok: false, log: e instanceof Error ? e.message : String(e) };
	}
}

async function launchSigningPublish(
	app: FlatpakApp,
	gpgKey: string,
	gpgPassphrase: string,
	paths: RunPaths
): Promise<{ ok: boolean; log: string }> {
	const script = buildPublishScript(app, paths);
	return launchDetachedRun(paths, script, [
		{ path: paths.passphrasePath, contents: gpgPassphrase, mode: 0o600 },
		{ path: paths.gpgKeyPath, contents: gpgKey, mode: 0o600 }
	]);
}

// Manual, explicitly-triggered repair for when the appstream2/x86_64 branch is
// already broken/stale, not run automatically as part of routine publishing
// (see buildPublishScript's comment for why that caused real corruption once).
function buildRepairScript(gpgKeyPath: string): string {
	return `#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "$0" "${gpgKeyPath}"' EXIT

IFS= read -r GPG_PASSPHRASE

REPO_PATH="${CONTAINER_REPO_PATH}"

${buildGpgImportSection(gpgKeyPath)}

ostree refs --repo="$REPO_PATH" appstream2/x86_64 --delete || true

flatpak build-update-repo \\
  --gpg-sign="$GPG_ID" \\
  --prune \\
  --generate-static-deltas \\
  --verbose \\
  "$REPO_PATH"

echo "FORGE_REPAIR_OK"
`;
}

// Shared by repairAppstream/unpublishFlatpak/extractAppstreamMetadata: loads
// infra settings (just to check GPG is configured - R2 isn't involved here
// at all anymore, see the module doc comment above), writes the given script
// (plus a GPG key file, even when the script itself doesn't use one - see
// buildExtractScript) to the scratch directory, runs it with the passphrase
// piped over stdin, and always cleans the run's scratch files up afterward.
// Never throws, callers get {ok, log} either way.
async function runOnBuilder(
	scriptBuilder: (gpgKeyPath: string) => string,
	runIdPrefix: string
): Promise<{ ok: boolean; exitCode: number | null; log: string }> {
	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	if (!settings?.gpgPrivateKeyEncrypted || !settings.gpgPassphraseEncrypted) {
		return {
			ok: false,
			exitCode: null,
			log: 'Infra settings are not fully configured (missing GPG key or GPG passphrase).'
		};
	}

	const runDir = `${SCRATCH_ROOT}/${runIdPrefix}-${Date.now()}`;
	try {
		const gpgKey = decryptSecret(settings.gpgPrivateKeyEncrypted);
		const gpgPassphrase = decryptSecret(settings.gpgPassphraseEncrypted);
		const scriptPath = `${runDir}/script.sh`;
		const gpgKeyPath = `${runDir}/gpgkey`;
		const script = scriptBuilder(gpgKeyPath);

		await writeScratchFile(gpgKeyPath, gpgKey, 0o600);
		await writeScratchFile(scriptPath, script, 0o700);
		const { exitCode, log } = await runPiped(scriptPath, gpgPassphrase);
		return { ok: exitCode === 0, exitCode, log };
	} catch (e) {
		return { ok: false, exitCode: null, log: e instanceof Error ? e.message : String(e) };
	} finally {
		await rm(runDir, { recursive: true, force: true }).catch(() => {});
	}
}

export async function repairAppstream(): Promise<{ ok: boolean; log: string }> {
	return runOnBuilder(buildRepairScript, 'repair');
}

const EXTRACT_METAINFO_START = 'FORGE_METAINFO_B64_START';
const EXTRACT_METAINFO_END = 'FORGE_METAINFO_B64_END';
const EXTRACT_ICON_START = 'FORGE_ICON_B64_START';
const EXTRACT_ICON_END = 'FORGE_ICON_B64_END';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// The extraction scripts now fall back to hicolor/scalable/apps/$APPID.svg
// when no sized raster icon exists, so an extracted icon is no longer
// guaranteed to be a PNG, callers must not assume the extension/mime type.
export function iconFileExtension(buffer: Buffer): 'png' | 'svg' {
	return buffer.subarray(0, 4).equals(PNG_MAGIC) ? 'png' : 'svg';
}

// Read-only: imports the bundle into a throwaway staging repo (never touches the
// shared repo, never imports/uses the GPG key) purely to read back its own, real
// AppStream metainfo.xml and icon, so Forge's web UI can be populated from what's
// actually inside the bundle instead of free-text form fields a developer could
// type anything into.
function buildExtractScript(bundleUrl: string): string {
	return `#!/usr/bin/env bash
set -euo pipefail
trap '[ -n "\${WORKDIR:-}" ] && rm -rf "$WORKDIR"' EXIT

BUNDLE_URL="${bundleUrl}"

WORKDIR=$(mktemp -d)
cd "$WORKDIR"

echo "FORGE_STEP: downloading bundle"
curl -fsSL "$BUNDLE_URL" -o bundle.flatpak

STAGING_REPO="$WORKDIR/staging-repo"
echo "FORGE_STEP: initializing staging repo"
ostree init --repo="$STAGING_REPO" --mode=archive-z2
echo "FORGE_STEP: importing bundle"
flatpak build-import-bundle "$STAGING_REPO" bundle.flatpak

echo "FORGE_STEP: resolving ref"
# grep exits non-zero when a bundle has no app/ ref at all (e.g. a runtime-only
# bundle, see below), which under set -e -o pipefail would otherwise kill the
# whole script right here before the runtime fallback ever runs.
REF=$(ostree refs --repo="$STAGING_REPO" | grep "^app/" | head -n1 || true)
if [ -z "$REF" ]; then
  # Not every submission is a user-facing app, GTK/Qt themes and other extensions
  # ship as a runtime instead, those have no .desktop file or per-app metainfo.xml,
  # but are still a legitimate thing to host, so accept them too.
  REF=$(ostree refs --repo="$STAGING_REPO" | grep "^runtime/" | head -n1 || true)
fi
if [ -z "$REF" ]; then
  echo "Uploaded file has no importable Flatpak app or runtime ref" >&2
  exit 1
fi
APPID=$(echo "$REF" | cut -d/ -f2)
echo "FORGE_APPID=$APPID"
echo "FORGE_REF=$REF"

echo "FORGE_STEP: checking out ref"
ostree checkout -U --repo="$STAGING_REPO" "$REF" checkout

# metainfo.xml is optional, a runtime typically doesn't ship one, missing metainfo
# just means the name/summary/description/icon fall back to placeholders below
# rather than blocking the submission entirely.
echo "FORGE_STEP: looking for metainfo.xml"
# Named exactly $APPID, not a bare '*.xml' glob, same reasoning as the git
# build path below: a base app/SDK extension baked into the bundle can ship
# its own metainfo/icon in the same directories as the submitted app's own.
METAINFO_PATH=$(find checkout/files/share/metainfo checkout/export/share/metainfo -maxdepth 1 \\( -name "$APPID.metainfo.xml" -o -name "$APPID.appdata.xml" \\) 2>/dev/null | head -n1 || true)
if [ -n "$METAINFO_PATH" ]; then
  echo "${EXTRACT_METAINFO_START}"
  base64 -w0 "$METAINFO_PATH"
  echo ""
  echo "${EXTRACT_METAINFO_END}"
fi

echo "FORGE_STEP: looking for an icon"
# export/share/app-info/icons/flatpak/{size}/$APPID.png first: a bundle
# built via the normal flatpak-builder/build-export flow already ran
# appstreamcli compose on the developer's own machine, which resolves a
# manifest's declared icon (name-vs-appid mismatches) and rasterizes an
# SVG-only icon into a real PNG - both problems the plain
# files/share/icons/hicolor/*/apps/ lookup below can't handle on its own
# (see buildGitExtractionSection's comment for the real, reproduced case
# this fixes - io.github.shyvortex.BraveOrigin ships only an SVG, no raster
# PNG at any size). Falls back to sized PNGs then scalable/apps (svg-only
# icon, or a raster png mistakenly installed into scalable/apps instead of a
# sized dir) if the bundle's own export subtree doesn't have it.
ICON_PATH=$(ls checkout/export/share/app-info/icons/flatpak/128x128/"$APPID".png \\
  checkout/export/share/app-info/icons/flatpak/64x64/"$APPID".png \\
  checkout/files/share/icons/hicolor/256x256/apps/"$APPID".png \\
  checkout/files/share/icons/hicolor/128x128/apps/"$APPID".png \\
  checkout/files/share/icons/hicolor/64x64/apps/"$APPID".png \\
  checkout/files/share/icons/hicolor/48x48/apps/"$APPID".png \\
  checkout/files/share/icons/hicolor/scalable/apps/"$APPID".svg \\
  checkout/files/share/icons/hicolor/scalable/apps/"$APPID".png 2>/dev/null | head -n1 || true)
if [ -n "$ICON_PATH" ]; then
  echo "${EXTRACT_ICON_START}"
  base64 -w0 "$ICON_PATH"
  echo ""
  echo "${EXTRACT_ICON_END}"
fi

echo "FORGE_EXTRACT_OK"
`;
}

function extractBetweenMarkers(
	log: string,
	startMarker: string,
	endMarker: string
): string | undefined {
	const start = log.indexOf(startMarker);
	if (start === -1) return undefined;
	const contentStart = start + startMarker.length;
	const end = log.indexOf(endMarker, contentStart);
	if (end === -1) return undefined;
	return log.slice(contentStart, end).trim();
}

// AppStream allows both the older <developer_name> and the newer <developer><name>
// form, and either can appear as a plain string or as an object with a #text node
// depending on whether the parser sees attributes alongside it. A translated
// component (multiple <name>/<summary> elements with different xml:lang) parses
// to an ARRAY of those, which is also `typeof === 'object'` but has no '#text' of
// its own - without this branch every one of these fields silently came back
// empty for any bundle with translated AppStream metadata.
function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		// Prefer the untranslated/default entry (no xml:lang) for single-value
		// fields, these aren't meant to be localized themselves.
		const untranslated = value.find(
			(v) => typeof v === 'string' || !('@_xml:lang' in (v as Record<string, unknown>))
		);
		return textOf(untranslated ?? value[0]);
	}
	if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
		return String((value as Record<string, unknown>)['#text'] ?? '');
	}
	return '';
}

export type LocalizedMetadata = { name: string; summary: string; description: string };

function collectLangVariants(value: unknown): Record<string, string> {
	const items = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
	const result: Record<string, string> = {};
	for (const item of items) {
		if (typeof item === 'string') {
			if (item.trim()) result.en = item.trim();
			continue;
		}
		if (item && typeof item === 'object') {
			const obj = item as Record<string, unknown>;
			const lang = typeof obj['@_xml:lang'] === 'string' ? (obj['@_xml:lang'] as string) : 'en';
			const text = textOf(obj).trim();
			if (text) result[lang] = text;
		}
	}
	return result;
}

// <description> blocks carry their own inner markup verbatim (see the comment
// on the single-value extraction below), so translated variants are pulled the
// same way, by matching each <description>/<description xml:lang="..."> block
// directly out of the source XML rather than the parsed object tree.
function collectDescriptionVariants(xml: string): Record<string, string> {
	const result: Record<string, string> = {};
	const regex = /<description(?:\s+xml:lang="([^"]+)")?\s*>([\s\S]*?)<\/description>/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(xml))) {
		const lang = match[1] || 'en';
		const text = match[2].trim();
		if (text) result[lang] = text;
	}
	return result;
}

// Preview-only: the real submission fields (parseAppstreamComponent, used for
// what's actually saved) are intentionally single-language, Flatpak has no
// translation model the way PwaTranslation exists for PWAs. This just surfaces
// every language actually present in the bundle's own metainfo.xml so a
// submitter can double check translated listings before submitting.
export function parseAppstreamTranslations(xml: string): Record<string, LocalizedMetadata> {
	const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
	const doc = parser.parse(xml) as Record<string, unknown>;
	const component = (doc.component ?? {}) as Record<string, unknown>;

	const names = collectLangVariants(component.name);
	const summaries = collectLangVariants(component.summary);
	const descriptions = collectDescriptionVariants(xml);

	const langs = new Set([
		...Object.keys(names),
		...Object.keys(summaries),
		...Object.keys(descriptions)
	]);
	if (langs.size === 0) langs.add('en');

	const result: Record<string, LocalizedMetadata> = {};
	for (const lang of langs) {
		result[lang] = {
			name: names[lang] ?? names.en ?? '',
			summary: summaries[lang] ?? summaries.en ?? '',
			description: descriptions[lang] ?? descriptions.en ?? ''
		};
	}
	return result;
}

function parseAppstreamComponent(xml: string): {
	name: string;
	summary: string;
	description: string;
	developerName: string;
	homepageUrl: string;
	screenshots: string[];
} {
	const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
	const doc = parser.parse(xml) as Record<string, unknown>;
	const component = (doc.component ?? {}) as Record<string, unknown>;

	const name = textOf(component.name).trim();
	const summary = textOf(component.summary).trim();

	// Description is a mix of <p>/<ul>/<ol>/<li> elements meant to be shown as HTML
	// (matches Forge's existing "Description (HTML)" field), pulling the raw inner
	// XML straight out of the source string preserves that markup exactly, rather
	// than trying to reconstruct it from the parsed object tree.
	const descMatch = xml.match(/<description>([\s\S]*?)<\/description>/);
	const description = descMatch ? descMatch[1].trim() : '';

	let developerName = textOf(component.developer_name).trim();
	if (!developerName && component.developer && typeof component.developer === 'object') {
		developerName = textOf((component.developer as Record<string, unknown>).name).trim();
	}

	let homepageUrl = '';
	const urlsRaw = component.url;
	const urls = Array.isArray(urlsRaw) ? urlsRaw : urlsRaw ? [urlsRaw] : [];
	for (const u of urls as Record<string, unknown>[]) {
		if (u?.['@_type'] === 'homepage') homepageUrl = textOf(u).trim();
	}

	const screenshots: string[] = [];
	const shotsRaw = (component.screenshots as Record<string, unknown> | undefined)?.screenshot;
	const shots = Array.isArray(shotsRaw) ? shotsRaw : shotsRaw ? [shotsRaw] : [];
	for (const s of shots as Record<string, unknown>[]) {
		const url = textOf(s?.image).trim();
		if (url) screenshots.push(url);
	}

	return { name, summary, description, developerName, homepageUrl, screenshots };
}

export type ExtractedAppstream = {
	ok: boolean;
	appid?: string;
	branch?: string;
	name?: string;
	summary?: string;
	description?: string;
	developerName?: string;
	homepageUrl?: string;
	screenshots?: string[];
	iconBuffer?: Buffer;
	translations?: Record<string, LocalizedMetadata>;
	error?: string;
	log?: string;
};

export async function extractAppstreamMetadata(bundleUrl: string): Promise<ExtractedAppstream> {
	const { ok, exitCode, log } = await runOnBuilder(() => buildExtractScript(bundleUrl), 'extract');
	if (!ok || !log.includes('FORGE_EXTRACT_OK')) {
		// The last line isn't necessarily the actual failure, a step can print a
		// perfectly normal progress message and then die with no further output at
		// all (process killed, out of disk, etc.), so the headline names the last
		// step reached instead of guessing at an error line, the full log (always
		// returned below) has the real detail.
		const lastStepMatch = [...log.matchAll(/^FORGE_STEP: (.+)$/gm)].pop();
		const lastStep = lastStepMatch?.[1];
		const codeDesc = exitCode === null ? 'the extraction process failed to start' : `exit code ${exitCode}`;
		return {
			ok: false,
			error: lastStep
				? `Extraction failed after "${lastStep}" (${codeDesc}) - see log below`
				: `Extraction failed (${codeDesc}) - see log below`,
			log
		};
	}

	const appidMatch = log.match(/^FORGE_APPID=(.+)$/m);
	const refMatch = log.match(/^FORGE_REF=(.+)$/m);
	const metainfoB64 = extractBetweenMarkers(
		log,
		EXTRACT_METAINFO_START,
		EXTRACT_METAINFO_END
	)?.replace(/\s+/g, '');
	const iconB64 = extractBetweenMarkers(log, EXTRACT_ICON_START, EXTRACT_ICON_END)?.replace(
		/\s+/g,
		''
	);

	if (!appidMatch) {
		return { ok: false, error: 'Could not determine an app id for the uploaded bundle', log };
	}

	const appid = appidMatch[1].trim();
	const branch = refMatch ? refMatch[1].trim().split('/').pop() : 'stable';
	const iconBuffer = iconB64 ? Buffer.from(iconB64, 'base64') : undefined;
	const metainfoXml = metainfoB64 ? Buffer.from(metainfoB64, 'base64').toString('utf8') : undefined;
	const parsed = metainfoXml
		? parseAppstreamComponent(metainfoXml)
		: {
				name: '',
				summary: '',
				description: '',
				developerName: '',
				homepageUrl: '',
				screenshots: []
			};
	const translations = metainfoXml ? parseAppstreamTranslations(metainfoXml) : undefined;

	return { ok: true, appid, branch, iconBuffer, translations, log, ...parsed };
}

// Removes a specific app's ref from the repo (if present) and republishes, so the
// repo's summary/deltas/appstream catalog no longer advertise it. Used both by a
// reviewer's explicit "pull" and by deleting a Flatpak that's currently live.
function buildUnpublishScript(app: FlatpakApp, gpgKeyPath: string): string {
	return `#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "$0" "${gpgKeyPath}"' EXIT

IFS= read -r GPG_PASSPHRASE

APPID="${app.appid}"
REPO_PATH="${CONTAINER_REPO_PATH}"

${buildGpgImportSection(gpgKeyPath)}

REF=$(ostree refs --repo="$REPO_PATH" | grep "^app/$APPID/" | head -n1)
if [ -n "$REF" ]; then
  ostree refs --repo="$REPO_PATH" "$REF" --delete
fi

flatpak build-update-repo \\
  --gpg-sign="$GPG_ID" \\
  --prune \\
  --generate-static-deltas \\
  --verbose \\
  "$REPO_PATH"

echo "FORGE_UNPUBLISH_OK"
`;
}

export async function unpublishFlatpak(app: FlatpakApp): Promise<{ ok: boolean; log: string }> {
	return runOnBuilder((gpgKeyPath) => buildUnpublishScript(app, gpgKeyPath), `unpublish-${app.id}`);
}

// Only relevant for GIT-sourced apps: a bundle submission already extracted its
// display data once at upload time (see extractAppstreamMetadata), but a git
// submission has nothing to show until a build actually produces AppStream data,
// so it's re-read from the sidecar files a successful run wrote (see
// buildGitExtractionSection and BuildSidecarPaths) at finalize time in
// pollBuildOnce.
async function updateDisplayDataFromSidecars(
	metainfoB64: string,
	iconB64: string
): Promise<Record<string, unknown>> {
	const data: Record<string, unknown> = {};

	// Independent of the icon below: a build can produce one without the other
	// (or vice versa), neither should block the other from updating.
	if (metainfoB64) {
		const metainfoXml = Buffer.from(metainfoB64, 'base64').toString('utf8');
		const parsed = parseAppstreamComponent(metainfoXml);
		data.name = parsed.name || undefined;
		data.summary = parsed.summary || undefined;
		data.description = parsed.description || undefined;
		data.homepageUrl = parsed.homepageUrl || undefined;
		data.screenshots = parsed.screenshots.length ? parsed.screenshots : undefined;
	}

	if (iconB64) {
		const iconBuffer = Buffer.from(iconB64, 'base64');
		const iconArrayBuffer = iconBuffer.buffer.slice(
			iconBuffer.byteOffset,
			iconBuffer.byteOffset + iconBuffer.byteLength
		) as ArrayBuffer;
		data.iconUrl = await uploadFile(
			iconArrayBuffer,
			`${crypto.randomUUID()}.${iconFileExtension(iconBuffer)}`
		);
	}

	return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

// Bounded tail read for both the live-view refresh and the final stored log -
// generous enough for any real build, matches the "read a bounded amount"
// posture already used elsewhere in this file (e.g. notification bodies).
const LOG_READ_BYTES = 5_000_000;
const POLL_INTERVAL_MS = 7_000;

// Builds currently being tracked by the poller below - populated by triggerPublish
// right after a successful launch, and by reconcileStuckBuilds on server startup.
const activeBuildIds = new Set<string>();

// One poll tick for one build: reads the exit-marker file straight off the
// shared scratch volume (no network round trip at all now, just local fs)
// and either refreshes the live log (still running) or finalizes (done).
//
// Finalizing is deliberately idempotent and safe to retry: the tracked build id
// is only removed from activeBuildIds, and the scratch run directory is only
// deleted, *after* the DB writes below actually succeed. If they throw (e.g.
// the exact transient Postgres error that originally left a row stuck on
// PROCESSING forever), this function just logs it and returns - the exit file
// is still sitting there, so the very next tick (~POLL_INTERVAL_MS later)
// re-reads it and retries the same finalize from scratch. No bespoke
// backoff/retry helper needed: a blip under one interval self-heals silently,
// a longer outage self-heals whenever Postgres comes back, and a Forge
// process-level restart mid-outage is covered by reconcileStuckBuilds
// re-discovering the same build (the detached run keeps going regardless,
// see runDetached - as long as the container itself isn't recreated).
async function pollBuildOnce(buildId: string): Promise<void> {
	const build = await db.flatpakBuild.findUnique({
		where: { id: buildId },
		include: { flatpakApp: true }
	});
	if (!build || build.finishedAt) {
		activeBuildIds.delete(buildId);
		return;
	}

	try {
		const exitRaw = (await readScratchFileOrEmpty(build.remoteExitPath)).trim();
		if (exitRaw === '') {
			// Still running - keep the live-view log fresh, best effort only.
			const log = await tailFile(build.remoteLogPath, LOG_READ_BYTES);
			await db.flatpakBuild
				.update({ where: { id: build.id }, data: { log } })
				.catch((e) => console.error(`Failed to refresh live log for build ${build.id}:`, e));
			return;
		}

		const ok = exitRaw === '0';
		const app = build.flatpakApp;
		const log = await tailFile(build.remoteLogPath, LOG_READ_BYTES);
		const runDir = dirname(build.remoteLogPath);
		const sidecar = sidecarPathsFromRunDir(runDir);
		// The commit actually built can be later than app.gitLastCommit if more
		// pushes landed between the watcher flagging this for review and the
		// reviewer approving it - record what was really built, not just what
		// was detected.
		const gitCommit = (await readScratchFileOrEmpty(sidecar.commitPath)).trim();

		try {
			const displayData =
				ok && app.sourceType === 'GIT'
					? await updateDisplayDataFromSidecars(
							await readScratchFileOrEmpty(sidecar.metainfoPath),
							await readScratchFileOrEmpty(sidecar.iconPath)
						)
					: {};
			await db.flatpakApp.update({
				where: { id: app.id },
				data: {
					status: ok ? 'APPROVED' : 'FAILED',
					buildFinishedAt: new Date(),
					...(ok && gitCommit ? { gitLastCommit: gitCommit } : {}),
					...displayData
				}
			});
			await db.flatpakBuild.update({
				where: { id: build.id },
				data: { status: ok ? 'SUCCESS' : 'FAILED', log, finishedAt: new Date() }
			});
		} catch (e) {
			console.error(`Failed to finalize build ${build.id}, will retry next tick:`, e);
			return;
		}

		activeBuildIds.delete(build.id);
		await rm(runDir, { recursive: true, force: true }).catch(() => {});

		if (app.submittedById) {
			await notifyUser(
				app.submittedById,
				ok
					? {
							type: 'flatpak_approved',
							title: `${app.name} was published`,
							link: `/dashboard/flatpaks/${app.id}`
						}
					: {
							type: 'flatpak_failed',
							title: `${app.name} failed to build`,
							body: log.slice(-500),
							link: `/dashboard/flatpaks/${app.id}`
						}
			).catch((e) => console.error(`Failed to notify submitter for build ${build.id}:`, e));
		}
	} catch (e) {
		console.error(`Poll failed for build ${buildId}, will retry next tick:`, e);
	}
}

let pollerStarted = false;

// Wired from hooks.server.ts next to startGitWatcher, same guard-against-double-
// start shape. Reconciliation runs once at startup so a row left on PROCESSING
// by a crash/restart (or the exact DB-write race this file's poller exists to
// survive) gets picked back up automatically instead of needing a manual retry.
export function startBuildPoller(): void {
	if (pollerStarted) return;
	pollerStarted = true;

	reconcileStuckBuilds().catch((e) => console.error('Build poller reconciliation failed:', e));

	setInterval(async () => {
		for (const buildId of [...activeBuildIds]) {
			await pollBuildOnce(buildId);
		}
	}, POLL_INTERVAL_MS);
}

async function reconcileStuckBuilds(): Promise<void> {
	const stuck = await db.flatpakApp.findMany({ where: { status: 'PROCESSING' } });
	for (const app of stuck) {
		const build = await db.flatpakBuild.findFirst({
			where: { flatpakAppId: app.id, finishedAt: null },
			orderBy: { startedAt: 'desc' }
		});
		if (build) activeBuildIds.add(build.id);
	}
}

async function finalizeLaunchFailure(buildId: string, app: FlatpakApp, log: string): Promise<void> {
	await db.flatpakApp.update({
		where: { id: app.id },
		data: { status: 'FAILED', buildFinishedAt: new Date() }
	});
	await db.flatpakBuild.update({
		where: { id: buildId },
		data: { status: 'FAILED', log, finishedAt: new Date() }
	});
	if (app.submittedById) {
		await notifyUser(app.submittedById, {
			type: 'flatpak_failed',
			title: `${app.name} failed to build`,
			body: log.slice(-500),
			link: `/dashboard/flatpaks/${app.id}`
		}).catch((e) => console.error('Failed to notify submitter of launch failure:', e));
	}
}

// Emergency stop, wired from the Infra Settings admin action: kills whatever's
// actually still running locally (best effort - a process that already
// finished/never existed just no-ops) and marks every
// PROCESSING app/build FAILED. Unlike pollBuildOnce's finalize, this is a
// deliberate synchronous one-off admin action (matches repairAppstream's
// shape), not something retried automatically, so a per-app failure is
// recorded in the returned log and skipped rather than the whole call
// throwing.
export async function abortAllProcessingBuilds(): Promise<{
	ok: boolean;
	log: string;
	count: number;
}> {
	const apps = await db.flatpakApp.findMany({
		where: { status: 'PROCESSING' },
		include: { builds: { where: { finishedAt: null }, orderBy: { startedAt: 'desc' }, take: 1 } }
	});
	if (apps.length === 0) {
		return { ok: true, log: 'No builds are currently processing.', count: 0 };
	}

	const lines: string[] = [];
	for (const app of apps) {
		const build = app.builds[0];
		if (!build) continue;
		try {
			// screenSessionName no longer names a real `screen` session - it holds
			// the run's script path (see launchPublish), matched here to kill the
			// right local process. pkill exits non-zero when nothing matches
			// (already finished), not a real failure.
			await execFileAsync('pkill', ['-f', build.screenSessionName]).catch(() => {});
			await rm(dirname(build.remoteLogPath), { recursive: true, force: true }).catch(() => {});
			lines.push(`${app.appid}: kill attempted`);
		} catch (e) {
			lines.push(`${app.appid}: could not abort (${e instanceof Error ? e.message : String(e)})`);
		}
	}

	let ok = true;
	for (const app of apps) {
		const build = app.builds[0];
		try {
			if (build) {
				activeBuildIds.delete(build.id);
				await db.flatpakBuild.update({
					where: { id: build.id },
					data: {
						status: 'FAILED',
						log: `${build.log}\n\n[Aborted by an admin via Infra Settings.]`,
						finishedAt: new Date()
					}
				});
			}
			await db.flatpakApp.update({
				where: { id: app.id },
				data: { status: 'FAILED', buildFinishedAt: new Date() }
			});
			if (app.submittedById) {
				await notifyUser(app.submittedById, {
					type: 'flatpak_failed',
					title: `${app.name} failed to build`,
					body: 'The build was aborted by an administrator.',
					link: `/dashboard/flatpaks/${app.id}`
				}).catch((e) =>
					console.error(`Failed to notify submitter for aborted build ${app.id}:`, e)
				);
			}
			lines.push(`${app.appid}: marked FAILED`);
		} catch (e) {
			ok = false;
			lines.push(`${app.appid}: failed to update - ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	return { ok, log: lines.join('\n'), count: apps.length };
}

const triggeringApps = new Set<string>();

// Creates the FlatpakBuild history row, prunes anything past the 10 most recent
// for this app, then launches the build detached (see launchSigningPublish)
// and hands it off to the shared poller. Doesn't await the build itself
// completing - the caller (the review approve/retry action) returns
// immediately, same as before, but the build's outcome is now tracked
// durably instead of living only in this async call's own stack.
export function triggerPublish(flatpakAppId: string, triggeredById?: string): void {
	if (triggeringApps.has(flatpakAppId)) return;
	triggeringApps.add(flatpakAppId);
	launchPublish(flatpakAppId, triggeredById).finally(() => triggeringApps.delete(flatpakAppId));
}

async function launchPublish(flatpakAppId: string, triggeredById?: string): Promise<void> {
	const app = await db.flatpakApp.findUnique({ where: { id: flatpakAppId } });
	if (!app) return;

	const paths = buildRunPaths(app.id);
	const build = await db.flatpakBuild.create({
		data: {
			flatpakAppId: app.id,
			status: 'PROCESSING',
			log: '',
			// No more real `screen` session (see abortAllProcessingBuilds) - this
			// field now just holds the run's script path.
			screenSessionName: paths.scriptPath,
			remoteLogPath: paths.logPath,
			remoteExitPath: paths.exitPath,
			triggeredById
		}
	});

	const stale = await db.flatpakBuild.findMany({
		where: { flatpakAppId: app.id },
		orderBy: { startedAt: 'desc' },
		skip: 10,
		select: { id: true }
	});
	if (stale.length) {
		await db.flatpakBuild.deleteMany({ where: { id: { in: stale.map((b) => b.id) } } });
	}

	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	if (!settings) {
		await finalizeLaunchFailure(build.id, app, 'Infra settings are not configured.');
		return;
	}
	if (!settings.gpgPrivateKeyEncrypted || !settings.gpgPassphraseEncrypted) {
		await finalizeLaunchFailure(
			build.id,
			app,
			'Infra settings are not fully configured (missing GPG key or GPG passphrase).'
		);
		return;
	}
	const gpgKey = decryptSecret(settings.gpgPrivateKeyEncrypted);
	const gpgPassphrase = decryptSecret(settings.gpgPassphraseEncrypted);
	const { ok, log } = await launchSigningPublish(app, gpgKey, gpgPassphrase, paths);
	if (!ok) {
		await finalizeLaunchFailure(build.id, app, log);
		return;
	}

	activeBuildIds.add(build.id);
}
