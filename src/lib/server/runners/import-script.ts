import type { RunnerJob } from '$lib/generated/prisma/client';
import { buildGpgImportSection, CONTAINER_REPO_PATH, type RunPaths } from '../flatpak-publish';

function importSection(job: RunnerJob, index: number): string {
	const source = `src-${index}`;
	const refs = job.refs.map((ref) => `"${ref}"`).join(' ');
	return `
echo "Signing the ${job.arch} build: ${job.refs.join(', ')}"
mkdir -p "${source}"
tar -xf "${job.artifactPath}" -C "${source}"
flatpak build-commit-from --src-repo="${source}" --gpg-sign="$GPG_ID" --no-update-summary "$REPO_PATH" ${refs}
rm -rf "${source}"
`;
}

export function buildImportScript(paths: RunPaths, jobs: RunnerJob[]): string {
	const artifacts = jobs.map((job) => `"${job.artifactPath}"`).join(' ');
	return `#!/usr/bin/env bash
set -euo pipefail
trap 'rm -f "$0" "${paths.passphrasePath}" "${paths.gpgKeyPath}" ${artifacts}; [ -n "\${WORKDIR:-}" ] && rm -rf "$WORKDIR"' EXIT

WORKDIR=$(mktemp -d)
cd "$WORKDIR"

GPG_PASSPHRASE=$(cat "${paths.passphrasePath}")
REPO_PATH="${CONTAINER_REPO_PATH}"

${buildGpgImportSection(paths.gpgKeyPath)}
${jobs.map(importSection).join('')}
flatpak build-update-repo \\
  --gpg-sign="$GPG_ID" \\
  --prune \\
  --generate-static-deltas \\
  --verbose \\
  "$REPO_PATH"
`;
}
