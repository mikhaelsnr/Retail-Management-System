-- Indexes follow existing list ordering and dashboard predicates. No RLS changes.
-- Existing PK/unique indexes already cover profiles.id, user_preferences.profile_id,
-- products.sku and inventory(branch_id, product_id).
create index if not exists products_name_id_idx on public.products (name, id);
create index if not exists customers_full_name_id_idx on public.customers (full_name, id);
create index if not exists profiles_full_name_id_idx on public.profiles (full_name, id);
create index if not exists inventory_created_at_id_idx on public.inventory (created_at, id);
create index if not exists sales_created_at_id_idx on public.sales (created_at desc, id);
create index if not exists inventory_movements_created_at_id_idx on public.inventory_movements (created_at desc, id);
-- Completed sales in a date range, with and without a branch filter.
create index if not exists sales_completed_branch_created_idx on public.sales (branch_id, created_at) where status = 'completed';
create index if not exists sales_completed_created_idx on public.sales (created_at) where status = 'completed';
-- Dashboard sale_items-to-sales join and sale detail/receipt lookups.
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
