import { db } from './db';
import { CDN_BASE, uploadText } from './r2';

export async function fetchCodeField(value: string): Promise<string> {
	if (!value || !value.startsWith(CDN_BASE)) return value;
	const res = await fetch(value);
	if (!res.ok) return value;
	return res.text();
}

export async function uploadCodeField(value: string, ext: 'css' | 'js'): Promise<string> {
	if (!value) return value;
	return uploadText(value, ext);
}

export function isValidRegex(pattern: string): boolean {
	if (!pattern) return true;
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
}

export function parseTranslations(data: FormData) {
	const seen = new Set<string>();
	const translations: {
		lang: string;
		name: string | null;
		summary: string | null;
		description: string | null;
	}[] = [];
	for (const key of data.keys()) {
		const match = key.match(/^trans_lang_(\d+)$/);
		if (!match) continue;
		const idx = match[1];
		const lang = ((data.get(key) as string) ?? '').trim().toLowerCase().slice(0, 10);
		if (!lang || seen.has(lang)) continue;
		seen.add(lang);
		translations.push({
			lang,
			name: ((data.get(`trans_name_${idx}`) as string) ?? '').trim() || null,
			summary: ((data.get(`trans_summary_${idx}`) as string) ?? '').trim() || null,
			description: ((data.get(`trans_description_${idx}`) as string) ?? '').trim() || null
		});
	}
	return translations;
}

export async function saveTranslations(appId: string, data: FormData) {
	const translations = parseTranslations(data);
	const langs = translations.map((t) => t.lang);
	await db.pwaTranslation.deleteMany({ where: { appId, lang: { notIn: langs } } });
	for (const t of translations) {
		if (t.name || t.summary || t.description) {
			await db.pwaTranslation.upsert({
				where: { appId_lang: { appId, lang: t.lang } },
				update: { name: t.name, summary: t.summary, description: t.description },
				create: {
					appId,
					lang: t.lang,
					name: t.name,
					summary: t.summary,
					description: t.description
				}
			});
		} else {
			await db.pwaTranslation.deleteMany({ where: { appId, lang: t.lang } });
		}
	}
}
