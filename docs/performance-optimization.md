# Retail Management System performance optimization

## Scope and findings
Reviewed the local application routes, shared components, Supabase clients/proxy, API import handlers, and schema/migrations. The major navigation bottlenecks were duplicate authentication/profile reads, sequential per-permission RPCs, four sequential dashboard reads, and unbounded list responses. Sidebar already uses Next Link; no sidebar redesign or navigation replacement was needed.

## Implemented changes
- `lib/get-user-context.ts`: server-only React cache shared by layout, permission guard and pages. One verified auth.getUser followed by concurrent profile (including role/branch), get_my_permissions and preference reads. Cache lifetime is one Server Component request; no persistent user cache or global Supabase client.
- `lib/require-permission.ts`: retains ANY-required-permission semantics, login redirects for missing/inactive profiles, and unauthorized redirects for denied access. All guarded routes benefit. Permission failures fail closed; they are not silently treated as success.
- Layout, Products, Inventory, Dashboard, Branches, Receive Stock, POS and Preferences reuse the context. Inventory reorder controls retain the exact global-or-assigned-branch management check. Dashboard still validates global branch choices against readable active branches and uses the assigned branch for branch users.
- Dashboard period sales, period items, inventory and recent sales execute in one Promise.all. Calculations, date boundaries, filters and recent-sale limit are unchanged. Query errors now render a failure instead of misleading zero totals. Users runs profile list, roles and branches concurrently. POS runs customers, inventory and serial lookups concurrently.
- Import validation batches three permission RPCs into one get_my_permissions RPC. Validation, Add Product and import mutation logic remain intact.
- Products, Inventory, Sales, Customers, Users and Inventory Movements use URL page parameters and 50 visible rows. Each query fetches 51 rows to detect Next without an exact count. Primary ordering is preserved with id as a deterministic tie breaker. Previous/Next preserve all other URL parameters, including repeated values. Invalid pages normalize to 1; empty out-of-range pages retain Previous. Existing pages had no search UI; no new search behavior is implied by preserving parameters.
- Lightweight theme-aware loading skeletons added to eight top-level system routes. Inventory's loading boundary also covers movements and other descendants. Existing Link navigation and automatic prefetch behavior remain intact.
- Removed unused Inventory selling price/branch code, Customers created_at and movement reference_type columns.
- Server client cookie handling and proxy claims validation retained. Login redirects now copy refreshed cookies from the proxy response. The matcher already excludes static assets and protects all relevant routes, so it was retained.
- ESLint now ignores generated build output. Removed one existing unused customer-insert result and converted the Tailwind animation import to ESM so full lint passes.

## Approximate call counts (source analysis, not measured network traces)
Counts below include layout plus page in the same authenticated Server Component render, excluding proxy. Each count is an explicit Supabase auth/query/RPC invocation; internal RLS function executions, token refresh/JWKS calls and SDK transport behavior are not counted.

| Page | Before | After | Calls removed |
| --- | ---: | ---: | ---: |
| Dashboard | 14?15 | 9 | 5?6 |
| Products | 11?14 | 5 | 6?9 |
| Inventory | 11?14 | 5 | 6?9 |

Before: layout auth + profile + permissions + preferences = 4; guard auth + profile + 1?N permission RPCs; Products adds 3 permission RPCs + 1 data query; Inventory adds 2 RPCs + profile + 1 query; Dashboard adds 1 RPC + profile + branches + 4 data queries.
After: shared context = 4 calls; Products/Inventory add 1; Dashboard adds branches + 4. Proxy getClaims remains a separate invocation in both cases and cannot share the React cache. Add one to both columns if counting this invocation. getClaims does not necessarily make a remote request with asymmetric keys and cached JWKS. Layout reuse/prefetch can change the calls seen on an actual client navigation. Import validation independently removes 2 permission RPCs per upload.

Critical dependency stages after auth: three context reads run concurrently; dashboard branch lookup then four parallel data queries. This replaces the four-query dashboard waterfall with one batch. Exact latency improvement depends on network distance, RLS planning, data volume and Vercel/Supabase regions; no measured percentage is claimed.

## Index migration
`supabase/migrations/202609080001_navigation_query_indexes.sql` prepares nine indexes, not applied to a database:
- products(name,id), customers(full_name,id), profiles(full_name,id), inventory(created_at,id), sales(created_at DESC,id), inventory_movements(created_at DESC,id): actual paginated ordering.
- Partial completed-sales indexes (branch_id,created_at) and (created_at): dashboard branch/date and global/date queries, including recent completed sales.
- sale_items(sale_id): dashboard join and detail/receipt equality lookup.

The schema has no equivalent secondary indexes. Existing primary/unique indexes already cover profiles.id, preferences.profile_id, products.sku and inventory(branch_id,product_id); none duplicated. No customers.branch_id exists in this schema. No speculative product-name substring index or standalone profile-branch index was added. These are query-shape justifications, not EXPLAIN-verified improvements. Inspect production pg_indexes and EXPLAIN (ANALYZE, BUFFERS) on staging before deployment. Standard CREATE INDEX can block writes while building; schedule this migration appropriately for table size. No database policies, functions, grants or business data were changed.

## Security and verification
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed with existing Next.js 16.3.3 Cache Components configuration (39 generated pages). Initial restricted-network attempt failed fetching existing Google Geist font; network-enabled retry passed without changing the font/UI.
- `node scripts/verify-performance.mjs`: passes pagination validation, URL preservation, ANY permission semantics, branch context, anonymous/inactive/profile-error denial, unauthorized denial and permission-RPC failure checks. These use mocked I/O, not live RLS or React-renderer tests.
- Production HTTP smoke check: anonymous requests to Dashboard, Products page 2, Inventory, Sales, Customers, Branches, Users, Settings, Add Product, Product Import and Receive Stock all return login redirects.
- All affected imports and routes compile. No service-role key, client-only authorization, RLS bypass or persistent auth cache introduced. Database policies remain authoritative. Parallel reads are independent reads, not a transaction snapshot; the old sequential queries were not a transaction snapshot either.
- No authenticated owner/manager/cashier sessions were available for end-to-end role tests. The unit scenarios check global/branch permissions and a cashier-like denial, not actual seeded role mappings. Live navigation timings, cross-user renderer cache isolation, mutation smoke checks and migration plans remain staging verification work.

## Remaining bottlenecks and next steps
1. Dashboard still retrieves raw sales/items/inventory for unchanged calculations and remains subject to Supabase response row limits. Introduce an RLS-respecting aggregate RPC in a separate change, with parity tests for all periods/branches/timezones before replacing it. This is the highest-priority scaling follow-up.
2. POS, Receive Stock and import validation still use broad lookup datasets; import also scans the fetched catalog in memory for each row. Paginating these blindly would break selectors/barcode validation. Add server-backed search and batched SKU/barcode validation with complete-result tests.
3. Sale details/receipts and unit lists retain additional reads; unit lists may need pagination for very large serialized inventory. Low-cardinality branch/role option lists remain unpaginated.
4. Offset pagination costs increase on deep pages; move to cursor pagination if measured data volume warrants it. Concurrent inserts/deletes can shift offset boundaries despite stable ordering.
5. Existing RLS for customers, inventory movements, sale items and payments is broadly authenticated in the baseline. This change preserves it; do not assume those policies enforce branch isolation. Review that separately with explicit role/business requirements.
6. Measure authenticated cold/warm navigation and RSC request timings for each role in a production-like deployment; compare p50/p95 and request counts with browser network tools. Check Vercel compute/Supabase region alignment. Supabase Pro alone does not remove application waterfalls.

Reference checks: [React request-scoped cache](https://react.dev/reference/react/cache) and [Supabase SSR client/proxy guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Files modified/added
- `app/(system)/branches/loading.tsx`
- `app/(system)/branches/page.tsx`
- `app/(system)/customers/loading.tsx`
- `app/(system)/customers/page.tsx`
- `app/(system)/dashboard/loading.tsx`
- `app/(system)/dashboard/page.tsx`
- `app/(system)/inventory/loading.tsx`
- `app/(system)/inventory/movements/page.tsx`
- `app/(system)/inventory/page.tsx`
- `app/(system)/inventory/receive/page.tsx`
- `app/(system)/layout.tsx`
- `app/(system)/pos/page.tsx`
- `app/(system)/products/loading.tsx`
- `app/(system)/products/page.tsx`
- `app/(system)/sales/loading.tsx`
- `app/(system)/sales/page.tsx`
- `app/(system)/settings/loading.tsx`
- `app/(system)/settings/preferences/page.tsx`
- `app/(system)/users/loading.tsx`
- `app/(system)/users/page.tsx`
- `app/api/products/import/validate/route.ts`
- `components/add-customer-form.tsx`
- `components/page-loading.tsx`
- `components/pagination.tsx`
- `docs/performance-optimization.md`
- `eslint.config.mjs`
- `lib/get-user-context.ts`
- `lib/pagination.ts`
- `lib/require-permission.ts`
- `lib/supabase/proxy.ts`
- `scripts/verify-performance.mjs`
- `supabase/migrations/202609080001_navigation_query_indexes.sql`
- `tailwind.config.ts`
