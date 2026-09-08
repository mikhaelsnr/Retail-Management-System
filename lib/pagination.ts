export const PAGE_SIZE = 50;
export type PageSearchParams = Record<string, string | string[] | undefined>;

export function getPage(params: PageSearchParams) {
  const value = typeof params.page === "string" ? params.page : "";
  const page = /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE) ? page : 1;
}

export function pageHref(path: string, params: PageSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  query.set("page", String(page));
  return `${path}?${query.toString()}`;
}
