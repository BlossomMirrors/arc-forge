// AppStream's own spec for <description> only ever allows p/ul/ol/li, with no
// attributes on any of them, this rebuilds the markup keeping only that exact
// allowlist (any other tag is unwrapped to its text, never dropped silently)
// rather than trusting a bundle's metainfo.xml (or a manually typed description)
// enough to render it as-is. Client-only: relies on DOMParser.
const ALLOWED_DESCRIPTION_TAGS = new Set(['P', 'UL', 'OL', 'LI']);

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeDescriptionNode(node: ChildNode): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return escapeHtml(node.textContent ?? '');
	}
	if (node.nodeType === Node.ELEMENT_NODE) {
		const el = node as Element;
		const inner = Array.from(el.childNodes).map(sanitizeDescriptionNode).join('');
		if (ALLOWED_DESCRIPTION_TAGS.has(el.tagName)) {
			const tag = el.tagName.toLowerCase();
			return `<${tag}>${inner}</${tag}>`;
		}
		return inner;
	}
	return '';
}

export function sanitizeAppstreamDescription(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return Array.from(doc.body.childNodes).map(sanitizeDescriptionNode).join('');
}
