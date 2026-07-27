import { env } from '$env/dynamic/private';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Fails closed on any network error, non-2xx, or malformed response, a broken
// siteverify call must never be treated as a passed check.
export async function verifyTurnstileToken(
	token: unknown,
	expectedAction: string,
	remoteIp?: string
): Promise<boolean> {
	if (typeof token !== 'string' || !token || token.length > 2048) return false;
	if (!env.TURNSTILE_SECRET) return false;

	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			signal: AbortSignal.timeout(10_000),
			body: new URLSearchParams({
				secret: env.TURNSTILE_SECRET,
				response: token,
				...(remoteIp ? { remoteip: remoteIp } : {})
			})
		});
		if (!response.ok) return false;
		const result = (await response.json()) as { success?: boolean; action?: string };
		return result.success === true && result.action === expectedAction;
	} catch {
		return false;
	}
}
