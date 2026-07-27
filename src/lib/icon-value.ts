export type IconValue =
	| { type: 'image'; url: string }
	| { type: 'emoji'; emoji: string }
	| { type: 'lucide'; name: string; color: string };

const EMOJI_PREFIX = 'emoji:';
const LUCIDE_PREFIX = 'lucide:';

export function parseIconValue(value: string | null | undefined): IconValue | null {
	if (!value) return null;
	if (value.startsWith(EMOJI_PREFIX)) {
		return { type: 'emoji', emoji: value.slice(EMOJI_PREFIX.length) };
	}
	if (value.startsWith(LUCIDE_PREFIX)) {
		const [name, color] = value.slice(LUCIDE_PREFIX.length).split(':');
		return { type: 'lucide', name, color: color || '#71717a' };
	}
	return { type: 'image', url: value };
}

export function encodeEmojiIcon(emoji: string): string {
	return `${EMOJI_PREFIX}${emoji}`;
}

export function encodeLucideIcon(name: string, color: string): string {
	return `${LUCIDE_PREFIX}${name}:${color}`;
}

// Lighter background, darker foreground of the same hue, picked deterministically
// from a seed (e.g. a list's title) so the same title always lands on the same color.
const AVATAR_PALETTE = [
	{ bg: 'bg-red-100 dark:bg-red-900/30', fg: 'text-red-700 dark:text-red-300' },
	{ bg: 'bg-orange-100 dark:bg-orange-900/30', fg: 'text-orange-700 dark:text-orange-300' },
	{ bg: 'bg-amber-100 dark:bg-amber-900/30', fg: 'text-amber-700 dark:text-amber-300' },
	{ bg: 'bg-emerald-100 dark:bg-emerald-900/30', fg: 'text-emerald-700 dark:text-emerald-300' },
	{ bg: 'bg-blue-100 dark:bg-blue-900/30', fg: 'text-blue-700 dark:text-blue-300' },
	{ bg: 'bg-purple-100 dark:bg-purple-900/30', fg: 'text-purple-700 dark:text-purple-300' }
];

export function avatarColors(seed: string): { bg: string; fg: string } {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0;
	}
	return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
