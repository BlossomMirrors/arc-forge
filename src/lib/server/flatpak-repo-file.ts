import { getGpgPublicKeyBase64 } from './flatpak-publish';
import type { InfraSettings } from '$lib/generated/prisma/client';

function iniLine(key: string, value: string | null | undefined): string {
	if (!value) return '';
	return `${key}=${value.replace(/[\r\n]+/g, ' ').trim()}\n`;
}

// Url is always derived from the request origin (never stored) so it can
// never drift from wherever this app is actually reachable. GPGKey is
// derived from the stored private key at request time, see
// getGpgPublicKeyBase64. Everything else is admin-editable metadata from
// InfraSettings, see the schema.prisma comment on those fields.
export async function renderFlatpakRepoFile(
	origin: string,
	settings: InfraSettings | null
): Promise<string> {
	const gpg = await getGpgPublicKeyBase64();

	let out = '[Flatpak Repo]\n';
	out += iniLine('Title', settings?.flatpakRepoTitle || 'BlossomOS Forge');
	out += iniLine('Url', `${origin}/flatpak/`);
	out += iniLine('Homepage', settings?.flatpakRepoHomepage);
	out += iniLine('Comment', settings?.flatpakRepoComment);
	out += iniLine('Description', settings?.flatpakRepoDescription);
	out += iniLine('Icon', settings?.flatpakRepoIconUrl);
	if (gpg.ok && gpg.base64) out += iniLine('GPGKey', gpg.base64);

	return out;
}
