-- Atomically create or update a product and its default variant.
-- SECURITY INVOKER preserves the caller's existing RLS policies.

create policy "Permission can create product variants"
on public.product_variants
for insert
to authenticated
with check (public.has_permission('products.manage'));

create policy "Permission can update product variants"
on public.product_variants
for update
to authenticated
using (public.has_permission('products.manage'))
with check (public.has_permission('products.manage'));

create or replace function public.save_product_with_variant(
  p_product_id uuid,
  p_name text,
  p_brand_id uuid,
  p_category_id uuid,
  p_sku text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_warranty_months integer,
  p_track_serial boolean,
  p_is_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_sku text := upper(trim(p_sku));
begin
  if not public.has_permission('products.manage') then
    raise exception 'You do not have permission to manage products';
  end if;

  if trim(coalesce(p_name, '')) = '' or v_sku = '' then
    raise exception 'Product name and SKU are required';
  end if;

  if p_cost_price < 0 or p_selling_price < 0 or p_warranty_months < 0 then
    raise exception 'Prices and warranty cannot be negative';
  end if;

  if p_product_id is null then
    insert into public.products (
      name,
      brand_id,
      category_id,
      sku,
      cost_price,
      selling_price,
      warranty_months,
      track_serial,
      is_active
    ) values (
      trim(p_name),
      p_brand_id,
      p_category_id,
      v_sku,
      p_cost_price,
      p_selling_price,
      p_warranty_months,
      p_track_serial,
      p_is_active
    )
    returning id into v_product_id;

    insert into public.product_variants (
      product_id,
      variant_name,
      sku,
      cost_price,
      selling_price,
      is_active
    ) values (
      v_product_id,
      'Default',
      v_sku,
      p_cost_price,
      p_selling_price,
      p_is_active
    );
  else
    v_product_id := p_product_id;

    update public.products
    set
      name = trim(p_name),
      brand_id = p_brand_id,
      category_id = p_category_id,
      sku = v_sku,
      cost_price = p_cost_price,
      selling_price = p_selling_price,
      warranty_months = p_warranty_months,
      track_serial = p_track_serial,
      is_active = p_is_active,
      updated_at = now()
    where id = v_product_id;

    if not found then
      raise exception 'Product not found';
    end if;

    select id
    into v_variant_id
    from public.product_variants
    where product_id = v_product_id
    order by created_at, id
    limit 1;

    if v_variant_id is null then
      insert into public.product_variants (
        product_id,
        variant_name,
        sku,
        cost_price,
        selling_price,
        is_active
      ) values (
        v_product_id,
        'Default',
        v_sku,
        p_cost_price,
        p_selling_price,
        p_is_active
      );
    else
      update public.product_variants
      set
        sku = v_sku,
        cost_price = p_cost_price,
        selling_price = p_selling_price,
        is_active = p_is_active,
        updated_at = now()
      where id = v_variant_id;
    end if;
  end if;

  return v_product_id;
exception
  when unique_violation then
    raise exception 'That SKU is already in use' using errcode = '23505';
end;
$$;

revoke all on function public.save_product_with_variant(
  uuid,
  text,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) from public;

grant execute on function public.save_product_with_variant(
  uuid,
  text,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) to authenticated;
