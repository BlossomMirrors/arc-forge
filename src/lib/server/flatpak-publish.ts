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
import { runnerJobsLog, settleRunnerJobs } from './runners/logs';
import { queueGitBuild, cancelJobsForBuild } from './runners/queue';
import { resumeRunnerBuild } from './runners/finalize';
import { BUILD_CACHE_ROOT } from './build-cache';

const execFileAsync = promisify(execFile);

export const CONTAINER_REPO_PATH = '/repo';
export { BUILD_CACHE_ROOT };

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

async function writeBuildCacheFile(path: string, contents: string, mode = 0o600): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents, { mode });
}

async function readBuildCacheFileOrEmpty(path: string): Promise<string> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return '';
	}
}

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

export function buildGpgImportSection(gpgKeyPath: string): string {
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

interface BuildSidecarPaths {
	commitPath: string;
	metainfoPath: string;
	iconPath: string;
}

function buildBundleImportSection(app: FlatpakApp): string {
	return `
BUNDLE_URL="${app.bundleUrl}"

curl -fsSL "$BUNDLE_URL" -o bundle.flatpak

flatpak build-import-bundle --gpg-sign="$GPG_ID" "$REPO_PATH" bundle.flatpak
`;
}

export interface RunPaths extends BuildSidecarPaths {
	runDir: string;
	scriptPath: string;
	logPath: string;
	exitPath: string;
	passphrasePath: string;
	gpgKeyPath: string;
}

export function sidecarPathsFromRunDir(runDir: string): BuildSidecarPaths {
	return {
		commitPath: `${runDir}/commit`,
		metainfoPath: `${runDir}/metainfo.b64`,
		iconPath: `${runDir}/icon.b64`
	};
}

export function buildRunPaths(appId: string): RunPaths {
	const runDir = `${BUILD_CACHE_ROOT}/run-${appId}-${Date.now()}`;
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

function buildPublishScript(app: FlatpakApp, paths: RunPaths): string {
	return `#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "$0" "${paths.passphrasePath}" "${paths.gpgKeyPath}"; [ -n "\${WORKDIR:-}" ] && rm -rf "$WORKDIR"' EXIT

WORKDIR=$(mktemp -d)
cd "$WORKDIR"

GPG_PASSPHRASE=$(cat "${paths.passphrasePath}")
APPID="${app.appid}"
REPO_PATH="${CONTAINER_REPO_PATH}"

${buildGpgImportSection(paths.gpgKeyPath)}
${buildBundleImportSection(app)}

flatpak build-update-repo \\
  --gpg-sign="$GPG_ID" \\
  --prune \\
  --generate-static-deltas \\
  --verbose \\
  "$REPO_PATH"
`;
}

export async function launchDetachedRun(
	paths: RunPaths,
	script: string,
	extraFiles: { path: string; contents: string; mode?: number }[] = []
): Promise<{ ok: boolean; log: string }> {
	try {
		await writeBuildCacheFile(paths.scriptPath, script, 0o700);
		for (const f of extraFiles) {
			await writeBuildCacheFile(f.path, f.contents, f.mode ?? 0o600);
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

	const runDir = `${BUILD_CACHE_ROOT}/${runIdPrefix}-${Date.now()}`;
	try {
		const gpgKey = decryptSecret(settings.gpgPrivateKeyEncrypted);
		const gpgPassphrase = decryptSecret(settings.gpgPassphraseEncrypted);
		const scriptPath = `${runDir}/script.sh`;
		const gpgKeyPath = `${runDir}/gpgkey`;
		const script = scriptBuilder(gpgKeyPath);

		await writeBuildCacheFile(gpgKeyPath, gpgKey, 0o600);
		await writeBuildCacheFile(scriptPath, script, 0o700);
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

export async function getGpgPublicKeyBase64(): Promise<{
	ok: boolean;
	base64?: string;
	log: string;
}> {
	const settings = await db.infraSettings.findUnique({ where: { id: 'singleton' } });
	if (!settings?.gpgPrivateKeyEncrypted) {
		return { ok: false, log: 'No GPG signing key is configured yet.' };
	}

	const runDir = `${BUILD_CACHE_ROOT}/pubkey-${Date.now()}`;
	const keyPath = `${runDir}/gpgkey`;
	try {
		await writeBuildCacheFile(keyPath, decryptSecret(settings.gpgPrivateKeyEncrypted), 0o600);
		const { stdout } = await execFileAsync('bash', [
			'-c',
			`gpg --batch --import "${keyPath}" >/dev/null 2>&1
GPG_ID=$(gpg --batch --with-colons --import-options show-only --import "${keyPath}" 2>/dev/null | awk -F: '/^fpr:/ {print $10; exit}')
[ -n "$GPG_ID" ] || exit 1
gpg --batch --export "$GPG_ID" | base64 -w0`
		]);
		return { ok: true, base64: stdout.trim(), log: '' };
	} catch (e) {
		const stderr =
			e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: unknown }).stderr) : '';
		return { ok: false, log: stderr || (e instanceof Error ? e.message : String(e)) };
	} finally {
		await rm(runDir, { recursive: true, force: true }).catch(() => {});
	}
}

function execErrorMessage(e: unknown): string {
	const stderr =
		e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: unknown }).stderr) : '';
	return stderr || (e instanceof Error ? e.message : String(e));
}

export async function pruneStaticDeltas(): Promise<{
	ok: boolean;
	log: string;
	deleted: number;
	kept: number;
}> {
	const repo = CONTAINER_REPO_PATH;
	try {
		const { stdout: refsOut } = await execFileAsync('ostree', ['refs', `--repo=${repo}`]);
		const refs = refsOut
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		const currentHeads = new Set<string>();
		for (const ref of refs) {
			try {
				const { stdout } = await execFileAsync('ostree', ['rev-parse', `--repo=${repo}`, ref]);
				currentHeads.add(stdout.trim());
			} catch {
			}
		}

		const { stdout: deltaOut } = await execFileAsync('ostree', [
			'static-delta',
			'list',
			`--repo=${repo}`
		]);
		const deltaNames = deltaOut
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		const log: string[] = [];
		let deleted = 0;
		let kept = 0;
		for (const name of deltaNames) {
			const to = name.includes('-') ? name.slice(name.lastIndexOf('-') + 1) : name;
			if (currentHeads.has(to)) {
				kept++;
				continue;
			}
			try {
				await execFileAsync('ostree', ['static-delta', 'delete', `--repo=${repo}`, name]);
				deleted++;
				log.push(`deleted stale delta ${name}`);
			} catch (e) {
				log.push(`failed to delete ${name}: ${execErrorMessage(e)}`);
			}
		}

		if (deleted > 0) {
			await execFileAsync('ostree', ['summary', '-u', `--repo=${repo}`]);
		}

		log.push(`\n${deleted} stale delta(s) deleted, ${kept} still-current delta(s) kept.`);
		return { ok: true, log: log.join('\n'), deleted, kept };
	} catch (e) {
		return { ok: false, log: execErrorMessage(e), deleted: 0, kept: 0 };
	}
}

const EXTRACT_METAINFO_START = 'FORGE_METAINFO_B64_START';
const EXTRACT_METAINFO_END = 'FORGE_METAINFO_B64_END';
const EXTRACT_ICON_START = 'FORGE_ICON_B64_START';
const EXTRACT_ICON_END = 'FORGE_ICON_B64_END';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function iconFileExtension(buffer: Buffer): 'png' | 'svg' {
	return buffer.subarray(0, 4).equals(PNG_MAGIC) ? 'png' : 'svg';
}

function buildExtractScript(bundleUrl: string): string {
	return `#!/usr/bin/env bash
set -euo pipefail
trap '[ -n "\${WORKDIR:-}" ] && rm -rf "$WORKDIR"' EXIT

BUNDLE_URL="${bundleUrl}"

WORKDIR=$(mktemp -d)
cd "$WORKDIR"

echo "FORGE_STEP: downloading bundle"
curl -fsSL "$BUNDLE_URL" -o bundle.flatpak

# flatpak build-bundle embeds the ref, a single-app appstream catalog (gzip'd, from
# files/share/app-info/xmls/$NAME.xml.gz at build time) and 64x64/128x128 icon PNGs
# directly into the bundle's own small header - the same data app-store frontends
# like GNOME Software read to preview an app before installing it. Reading it touches
# only a few KB at the start of the file regardless of how large the bundle's payload
# is, unlike importing the whole thing into a staging repo (which for a multi-GB game
# bundle previously made a metadata preview take as long as a full install). Falls
# through to a full import below for whatever this couldn't determine - a bundle
# assembled outside the normal flatpak-builder/build-export flow won't have this
# header data at all, and an SVG-only icon isn't embeddable in the header regardless.
echo "FORGE_STEP: reading bundle header"
HEADER_OUTPUT=$(python3 - "$PWD/bundle.flatpak" <<'PYEOF' || true
import base64, gzip, re, sys
import gi
gi.require_version('Flatpak', '1.0')
from gi.repository import Flatpak, Gio, GLib

try:
    ref = Flatpak.BundleRef.new(Gio.File.new_for_path(sys.argv[1]))
except GLib.Error:
    sys.exit(0)

print("FORGE_HEADER_APPID=" + ref.get_name())
print("FORGE_HEADER_REF=" + ref.format_ref())

appstream = ref.get_appstream()
if appstream:
    catalog = gzip.decompress(bytes(appstream.get_data())).decode('utf-8', 'replace')
    # "<component" is a prefix of "<components", the catalog's own wrapper tag -
    # the lookahead keeps a lazy match from starting one tag too early and
    # swallowing the wrapper's attributes into what should be a clean <component>.
    match = re.search(r'<component(?=[\\s>])[\\s\\S]*?</component>', catalog)
    if match:
        print("${EXTRACT_METAINFO_START}")
        print(base64.b64encode(match.group(0).encode()).decode())
        print("${EXTRACT_METAINFO_END}")

icon = ref.get_icon(128) or ref.get_icon(64)
if icon:
    print("${EXTRACT_ICON_START}")
    print(base64.b64encode(bytes(icon.get_data())).decode())
    print("${EXTRACT_ICON_END}")
PYEOF
)
echo "$HEADER_OUTPUT"

APPID=""
REF=""
if echo "$HEADER_OUTPUT" | grep -q "^FORGE_HEADER_APPID="; then
  APPID=$(echo "$HEADER_OUTPUT" | grep "^FORGE_HEADER_APPID=" | head -n1 | cut -d= -f2-)
  REF=$(echo "$HEADER_OUTPUT" | grep "^FORGE_HEADER_REF=" | head -n1 | cut -d= -f2-)
fi
HAVE_METAINFO=$(echo "$HEADER_OUTPUT" | grep -c "${EXTRACT_METAINFO_START}" || true)
HAVE_ICON=$(echo "$HEADER_OUTPUT" | grep -c "${EXTRACT_ICON_START}" || true)

if [ -z "$APPID" ] || [ "$HAVE_METAINFO" -eq 0 ] || [ "$HAVE_ICON" -eq 0 ]; then
  STAGING_REPO="$WORKDIR/staging-repo"
  echo "FORGE_STEP: initializing staging repo"
  ostree init --repo="$STAGING_REPO" --mode=archive-z2
  echo "FORGE_STEP: importing bundle"
  flatpak build-import-bundle "$STAGING_REPO" bundle.flatpak

  if [ -z "$APPID" ]; then
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
  fi

  # Reads individual files straight out of the imported commit via "ostree cat"
  # instead of checking out the whole tree - a checkout writes every file in the
  # bundle to disk, which for a multi-GB game bundle is gigabytes of assets this
  # only ever needed one small file out of.

  if [ "$HAVE_METAINFO" -eq 0 ]; then
    # metainfo.xml is optional, a runtime typically doesn't ship one, missing
    # metainfo just means the name/summary/description/icon fall back to
    # placeholders below rather than blocking the submission entirely.
    echo "FORGE_STEP: looking for metainfo.xml"
    # Named exactly $APPID, not a bare '*.xml' glob, same reasoning as the git
    # build path below: a base app/SDK extension baked into the bundle can ship
    # its own metainfo/icon in the same directories as the submitted app's own.
    METAINFO_PATH=""
    for candidate in \\
      "files/share/metainfo/$APPID.metainfo.xml" \\
      "files/share/metainfo/$APPID.appdata.xml" \\
      "export/share/metainfo/$APPID.metainfo.xml" \\
      "export/share/metainfo/$APPID.appdata.xml"; do
      if ostree cat --repo="$STAGING_REPO" "$REF" "$candidate" > metainfo.xml 2>/dev/null; then
        METAINFO_PATH="metainfo.xml"
        break
      fi
    done
    if [ -n "$METAINFO_PATH" ]; then
      echo "${EXTRACT_METAINFO_START}"
      base64 -w0 "$METAINFO_PATH"
      echo ""
      echo "${EXTRACT_METAINFO_END}"
    fi
  fi

  if [ "$HAVE_ICON" -eq 0 ]; then
    echo "FORGE_STEP: looking for an icon"
    # export/share/app-info/icons/flatpak/{size}/$APPID.png first: a bundle
    # built via the normal flatpak-builder/build-export flow already ran
    # appstreamcli compose on the developer's own machine, which resolves a
    # manifest's declared icon (name-vs-appid mismatches) and rasterizes an
    # SVG-only icon into a real PNG - both problems the plain
    # files/share/icons/hicolor/*/apps/ lookup below can't handle on its own
    # (see buildGitExtractionSection's comment for the real, reproduced case
    # this fixes - io.github.shyvortex.BraveOrigin ships only an SVG, no raster
    # PNG at any size, which is also why the header's own icon-64/icon-128
    # embedding above never has one for it either). Falls back to sized PNGs
    # then scalable/apps (svg-only icon, or a raster png mistakenly installed
    # into scalable/apps instead of a sized dir) if the bundle's own export
    # subtree doesn't have it.
    ICON_PATH=""
    for candidate in \\
      "export/share/app-info/icons/flatpak/128x128/$APPID.png" \\
      "export/share/app-info/icons/flatpak/64x64/$APPID.png" \\
      "files/share/icons/hicolor/256x256/apps/$APPID.png" \\
      "files/share/icons/hicolor/128x128/apps/$APPID.png" \\
      "files/share/icons/hicolor/64x64/apps/$APPID.png" \\
      "files/share/icons/hicolor/48x48/apps/$APPID.png" \\
      "files/share/icons/hicolor/scalable/apps/$APPID.svg" \\
      "files/share/icons/hicolor/scalable/apps/$APPID.png"; do
      if ostree cat --repo="$STAGING_REPO" "$REF" "$candidate" > icon.bin 2>/dev/null; then
        ICON_PATH="icon.bin"
        break
      fi
    done
    if [ -n "$ICON_PATH" ]; then
      echo "${EXTRACT_ICON_START}"
      base64 -w0 "$ICON_PATH"
      echo ""
      echo "${EXTRACT_ICON_END}"
    fi
  fi
fi

echo "FORGE_APPID=$APPID"
echo "FORGE_REF=$REF"
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

function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
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

const EXTRACTION_CACHE_TTL_MS = 15 * 60 * 1000;
const extractionCache = new Map<string, { result: ExtractedAppstream; expiresAt: number }>();

export async function extractAppstreamMetadata(bundleUrl: string): Promise<ExtractedAppstream> {
	const cached = extractionCache.get(bundleUrl);
	if (cached && cached.expiresAt > Date.now()) return cached.result;

	const result = await extractAppstreamMetadataUncached(bundleUrl);
	if (result.ok) {
		const now = Date.now();
		for (const [key, entry] of extractionCache) {
			if (entry.expiresAt <= now) extractionCache.delete(key);
		}
		extractionCache.set(bundleUrl, { result, expiresAt: now + EXTRACTION_CACHE_TTL_MS });
	}
	return result;
}

async function extractAppstreamMetadataUncached(bundleUrl: string): Promise<ExtractedAppstream> {
	const { ok, exitCode, log } = await runOnBuilder(() => buildExtractScript(bundleUrl), 'extract');
	if (!ok || !log.includes('FORGE_EXTRACT_OK')) {
		const lastStepMatch = [...log.matchAll(/^FORGE_STEP: (.+)$/gm)].pop();
		const lastStep = lastStepMatch?.[1];
		const codeDesc =
			exitCode === null ? 'the extraction process failed to start' : `exit code ${exitCode}`;
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

async function updateDisplayDataFromSidecars(
	metainfoB64: string,
	iconB64: string
): Promise<Record<string, unknown>> {
	const data: Record<string, unknown> = {};

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

const LOG_READ_BYTES = 5_000_000;
const POLL_INTERVAL_MS = 7_000;

const activeBuildIds = new Set<string>();

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
		const exitRaw = (await readBuildCacheFileOrEmpty(build.remoteExitPath)).trim();
		if (exitRaw === '') {
			const log =
				(await runnerJobsLog(build.id)) + (await tailFile(build.remoteLogPath, LOG_READ_BYTES));
			await db.flatpakBuild
				.update({ where: { id: build.id }, data: { log } })
				.catch((e) => console.error(`Failed to refresh live log for build ${build.id}:`, e));
			return;
		}

		const ok = exitRaw === '0';
		const app = build.flatpakApp;
		const log =
			(await runnerJobsLog(build.id)) + (await tailFile(build.remoteLogPath, LOG_READ_BYTES));
		const runDir = dirname(build.remoteLogPath);
		const sidecar = sidecarPathsFromRunDir(runDir);
		const gitCommit = (await readBuildCacheFileOrEmpty(sidecar.commitPath)).trim();

		try {
			const displayData =
				ok && app.sourceType === 'GIT'
					? await updateDisplayDataFromSidecars(
							await readBuildCacheFileOrEmpty(sidecar.metainfoPath),
							await readBuildCacheFileOrEmpty(sidecar.iconPath)
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
			await settleRunnerJobs(build.id, ok);
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
		if (build) await resumeRunnerBuild(build);
	}
}

export function trackBuild(buildId: string): void {
	activeBuildIds.add(buildId);
}

export async function finalizeLaunchFailure(
	buildId: string,
	app: FlatpakApp,
	log: string
): Promise<void> {
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
		await cancelJobsForBuild(build.id).catch((e) =>
			console.error(`Failed to cancel runner jobs for build ${build.id}:`, e)
		);
		try {
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
	if (app.sourceType === 'GIT') {
		await queueGitBuild(build.id);
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
