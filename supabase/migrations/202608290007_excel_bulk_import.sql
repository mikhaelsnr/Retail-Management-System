create or replace function public.bulk_import_products_inventory(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row jsonb;
  v_branch_id uuid;
  v_assigned_branch uuid;
  v_product_id uuid;
  v_brand_id uuid;
  v_category_id uuid;
  v_inventory_id uuid;
  v_serial text;
  v_sku text;
  v_qty integer;
  v_reorder integer;
  v_track boolean;
  v_product_created boolean;
  v_inventory_created boolean;
  v_products_created integer := 0;
  v_existing_products integer := 0;
  v_inventory_created_count integer := 0;
  v_units integer := 0;
  v_serials integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Import rows are required';
  end if;

  select branch_id into v_assigned_branch
  from public.profiles
  where id = v_user_id and is_active = true;
  if not found then raise exception 'Active user profile not found'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_sku := upper(trim(v_row ->> 'sku'));
    v_qty := (v_row ->> 'opening_quantity')::integer;
    v_track := (v_row ->> 'track_serial')::boolean;
    v_reorder := case when v_row ->> 'reorder_level' is null
      then null else (v_row ->> 'reorder_level')::integer end;

    if v_sku = '' or trim(coalesce(v_row ->> 'product_name', '')) = '' then
      raise exception 'SKU and product name are required';
    end if;
    if (v_row ->> 'cost_price')::numeric < 0
      or (v_row ->> 'selling_price')::numeric < 0
      or v_qty < 0
      or coalesce((v_row ->> 'warranty_months')::integer, 0) < 0
      or coalesce(v_reorder, 0) < 0 then
      raise exception 'Numeric import values cannot be negative';
    end if;

    select id into v_branch_id
    from public.branches
    where upper(code) = upper(trim(v_row ->> 'branch_code'))
      and is_active = true;
    if v_branch_id is null then
      raise exception 'Unknown or inactive branch code: %', v_row ->> 'branch_code';
    end if;

    if public.has_permission('inventory.manage_all') then null;
    elsif public.has_permission('inventory.manage_branch') then
      if v_assigned_branch is null or v_assigned_branch is distinct from v_branch_id then
        raise exception 'You can only import inventory for your assigned branch';
      end if;
    else
      raise exception 'You do not have permission to import inventory';
    end if;

    select id into v_product_id from public.products where upper(sku) = v_sku;
    v_product_created := v_product_id is null;

    if v_product_created then
      if not public.has_permission('products.manage') then
        raise exception 'products.manage is required to create SKU %', v_sku;
      end if;

      v_brand_id := null;
      if trim(coalesce(v_row ->> 'brand', '')) <> '' then
        select id into v_brand_id from public.brands
        where lower(name) = lower(trim(v_row ->> 'brand')) limit 1;
        if v_brand_id is null then
          insert into public.brands(name) values (trim(v_row ->> 'brand'))
          returning id into v_brand_id;
        end if;
      end if;

      v_category_id := null;
      if trim(coalesce(v_row ->> 'category', '')) <> '' then
        select id into v_category_id from public.categories
        where lower(name) = lower(trim(v_row ->> 'category')) limit 1;
        if v_category_id is null then
          insert into public.categories(name) values (trim(v_row ->> 'category'))
          returning id into v_category_id;
        end if;
      end if;

      insert into public.products(
        sku, name, description, brand_id, category_id, cost_price,
        selling_price, barcode, warranty_months, track_serial, is_active
      ) values (
        v_sku, trim(v_row ->> 'product_name'), nullif(trim(v_row ->> 'description'), ''),
        v_brand_id, v_category_id, (v_row ->> 'cost_price')::numeric,
        (v_row ->> 'selling_price')::numeric, nullif(trim(v_row ->> 'barcode'), ''),
        coalesce((v_row ->> 'warranty_months')::integer, 0), v_track, true
      ) returning id into v_product_id;

      insert into public.product_variants(
        product_id, variant_name, sku, barcode, cost_price, selling_price, is_active
      ) values (
        v_product_id, 'Default', v_sku, nullif(trim(v_row ->> 'barcode'), ''),
        (v_row ->> 'cost_price')::numeric, (v_row ->> 'selling_price')::numeric, true
      );
      v_products_created := v_products_created + 1;
    else
      v_existing_products := v_existing_products + 1;
      select track_serial into v_track from public.products where id = v_product_id;
    end if;

    select id into v_inventory_id from public.inventory
    where branch_id = v_branch_id and product_id = v_product_id;
    v_inventory_created := v_inventory_id is null;

    if v_inventory_created then
      insert into public.inventory(branch_id, product_id, quantity, reorder_level)
      values (
        v_branch_id, v_product_id, v_qty,
        coalesce(v_reorder, public.default_inventory_reorder_level())
      ) returning id into v_inventory_id;
      v_inventory_created_count := v_inventory_created_count + 1;
    else
      update public.inventory set quantity = quantity + v_qty, updated_at = now()
      where id = v_inventory_id;
    end if;

    if v_track then
      if jsonb_array_length(coalesce(v_row -> 'serial_numbers', '[]'::jsonb)) <> v_qty then
        raise exception 'Serial count must equal opening quantity for SKU %', v_sku;
      end if;
      for v_serial in select trim(value #>> '{}')
        from jsonb_array_elements(coalesce(v_row -> 'serial_numbers', '[]'::jsonb))
      loop
        if v_serial = '' then raise exception 'Empty serial number for SKU %', v_sku; end if;
        insert into public.serial_numbers(
          product_id, branch_id, serial_number, status, received_at
        ) values (v_product_id, v_branch_id, v_serial, 'available', now());
        v_serials := v_serials + 1;
      end loop;
    elsif jsonb_array_length(coalesce(v_row -> 'serial_numbers', '[]'::jsonb)) > 0 then
      raise exception 'Serial numbers are not allowed for non-serial SKU %', v_sku;
    end if;

    if v_qty > 0 then
      insert into public.inventory_movements(
        branch_id, product_id, movement_type, quantity,
        reference_type, notes, created_by
      ) values (
        v_branch_id, v_product_id, 'receive', v_qty,
        'excel_import', 'Excel bulk import', v_user_id
      );
    end if;
    v_units := v_units + v_qty;
  end loop;

  return jsonb_build_object(
    'products_created', v_products_created,
    'existing_products_used', v_existing_products,
    'inventory_records_created', v_inventory_created_count,
    'total_units_received', v_units,
    'serial_numbers_created', v_serials,
    'rows_skipped', 0
  );
exception
  when unique_violation then
    raise exception 'Duplicate SKU, barcode, or serial number conflicts with existing data'
      using errcode = '23505';
end;
$$;

revoke all on function public.bulk_import_products_inventory(jsonb) from public, anon;
grant execute on function public.bulk_import_products_inventory(jsonb) to authenticated;
