export const PAGE_SIZE = 20;

export function parsePage(url: URL, param: string): number {
	const raw = Number(url.searchParams.get(param));
	return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / pageSize));
}
