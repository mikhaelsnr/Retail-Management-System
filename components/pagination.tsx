import Link from "next/link";
import { pageHref, type PageSearchParams } from "@/lib/pagination";

export function Pagination({ path, params, page, hasNext }: {
  path: string; params: PageSearchParams; page: number; hasNext: boolean;
}) {
  return <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
    {page > 1 ? <Link className="rounded-md border px-3 py-2" href={pageHref(path, params, page - 1)}>Previous</Link> : <span />}
    <span>Page {page}</span>
    {hasNext ? <Link className="rounded-md border px-3 py-2" href={pageHref(path, params, page + 1)}>Next</Link> : <span />}
  </nav>;
}
