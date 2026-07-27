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
