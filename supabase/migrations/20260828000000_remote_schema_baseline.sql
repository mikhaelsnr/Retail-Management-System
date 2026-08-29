


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."complete_sale"("p_branch_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payment_method" "text", "p_payment_amount" numeric, "p_payment_reference" "text" DEFAULT NULL::"text", "p_discount_amount" numeric DEFAULT 0, "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_user_id uuid;
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;

  v_item jsonb;
  v_product_id uuid;
  v_serial_id uuid;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);

  v_serial_status text;
  v_serial_branch uuid;
  v_serial_product uuid;

  v_inventory_quantity integer;
begin
  -- ==========================================
  -- AUTH CHECK
  -- ==========================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'User is not authenticated';
  end if;

  if not public.has_permission('pos.use') then
    raise exception 'User does not have POS permission';
  end if;

  if p_branch_id <> public.current_user_branch_id()
   and not public.has_permission('inventory.manage_all') then

    raise exception
        'User cannot create sales for another branch';

  end if;

  -- ==========================================
  -- BASIC VALIDATION
  -- ==========================================

  if p_items is null
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must contain at least one item';
  end if;

  if p_payment_method not in (
    'cash',
    'gcash',
    'maya',
    'card',
    'bank_transfer'
  ) then
    raise exception 'Invalid payment method';
  end if;

  if p_discount_amount < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  -- ==========================================
  -- VALIDATE ITEMS + CALCULATE SUBTOTAL
  -- ==========================================

  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      (v_item ->> 'product_id')::uuid;

    v_serial_id :=
      (v_item ->> 'serial_number_id')::uuid;

    v_unit_price :=
      (v_item ->> 'unit_price')::numeric;

    if v_product_id is null then
      raise exception 'Product ID is required';
    end if;

    if v_serial_id is null then
      raise exception 'Serial number is required';
    end if;

    if v_unit_price is null
       or v_unit_price < 0 then
      raise exception 'Invalid unit price';
    end if;

    -- Lock serial row so another checkout cannot sell it simultaneously.
    select
      status,
      branch_id,
      product_id
    into
      v_serial_status,
      v_serial_branch,
      v_serial_product
    from public.serial_numbers
    where id = v_serial_id
    for update;

    if not found then
      raise exception 'Serial number does not exist';
    end if;

    if v_serial_status <> 'available' then
      raise exception 'Serial number is not available';
    end if;

    if v_serial_branch <> p_branch_id then
      raise exception 'Serial number belongs to another branch';
    end if;

    if v_serial_product <> v_product_id then
      raise exception 'Serial number does not belong to selected product';
    end if;

    -- Confirm stock exists at branch.
    select quantity
    into v_inventory_quantity
    from public.inventory
    where branch_id = p_branch_id
      and product_id = v_product_id
    for update;

    if not found then
      raise exception 'Inventory record not found';
    end if;

    if v_inventory_quantity <= 0 then
      raise exception 'Product is out of stock';
    end if;

    v_subtotal :=
      v_subtotal + v_unit_price;

  end loop;

  -- ==========================================
  -- FINAL TOTAL
  -- ==========================================

  if p_discount_amount > v_subtotal then
    raise exception 'Discount exceeds subtotal';
  end if;

  v_total :=
    v_subtotal - p_discount_amount;

  if p_payment_amount < v_total then
    raise exception 'Payment amount is insufficient';
  end if;

  -- ==========================================
  -- CREATE SALE
  -- ==========================================

  insert into public.sales (
    sale_number,
    branch_id,
    customer_id,
    cashier_id,
    subtotal,
    discount_amount,
    total_amount,
    status,
    notes
  )
  values (
    '',
    p_branch_id,
    p_customer_id,
    v_user_id,
    v_subtotal,
    p_discount_amount,
    v_total,
    'completed',
    p_notes
  )
  returning
    id,
    sale_number
  into
    v_sale_id,
    v_sale_number;

  -- ==========================================
  -- PROCESS SALE ITEMS
  -- ==========================================

  for v_item in
    select *
    from jsonb_array_elements(p_items)
  loop

    v_product_id :=
      (v_item ->> 'product_id')::uuid;

    v_serial_id :=
      (v_item ->> 'serial_number_id')::uuid;

    v_unit_price :=
      (v_item ->> 'unit_price')::numeric;

    v_line_total := v_unit_price;

    insert into public.sale_items (
      sale_id,
      product_id,
      serial_number_id,
      quantity,
      unit_price,
      discount_amount,
      line_total
    )
    values (
      v_sale_id,
      v_product_id,
      v_serial_id,
      1,
      v_unit_price,
      0,
      v_line_total
    );

    -- Mark exact unit as sold.
    update public.serial_numbers
    set
      status = 'sold',
      sold_at = now(),
      updated_at = now()
    where id = v_serial_id;

    -- Deduct branch inventory.
    update public.inventory
    set
      quantity = quantity - 1,
      updated_at = now()
    where branch_id = p_branch_id
      and product_id = v_product_id;

    -- Record movement.
    insert into public.inventory_movements (
      branch_id,
      product_id,
      serial_number_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      p_branch_id,
      v_product_id,
      v_serial_id,
      'sale',
      1,
      'sale',
      v_sale_id,
      'POS sale ' || v_sale_number,
      v_user_id
    );

  end loop;

  -- ==========================================
  -- PAYMENT
  -- ==========================================

  insert into public.payments (
    sale_id,
    payment_method,
    amount,
    tendered_amount,
    change_amount,
    reference_number,
    received_by
    )
    values (
        v_sale_id,
        p_payment_method,

        -- Actual amount applied to the sale
        v_total,

        -- Amount actually given/paid
        p_payment_amount,

        -- Change applies only to cash
        case
            when p_payment_method = 'cash'
            then p_payment_amount - v_total
            else 0
        end,

        p_payment_reference,
        v_user_id
    );

  return v_sale_id;
end;$$;


ALTER FUNCTION "public"."complete_sale"("p_branch_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payment_method" "text", "p_payment_amount" numeric, "p_payment_reference" "text", "p_discount_amount" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_branch_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select branch_id
    from public.profiles
    where id = auth.uid()
    limit 1;
$$;


ALTER FUNCTION "public"."current_user_branch_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select r.name
    from public.profiles p
    join public.roles r
      on r.id = p.role_id
    where p.id = auth.uid()
    limit 1;
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_customer_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
    if new.customer_code is null
       or trim(new.customer_code) = '' then

        new.customer_code :=
            'CUS-' ||
            lpad(
                nextval('public.customer_code_seq')::text,
                4,
                '0'
            );
    end if;

    return new;
end;
$$;


ALTER FUNCTION "public"."generate_customer_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_sale_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin

    if new.sale_number is null
       or trim(new.sale_number) = '' then

        new.sale_number :=
            'SALE-' ||
            lpad(
                nextval('public.sale_number_seq')::text,
                6,
                '0'
            );

    end if;

    return new;

end;
$$;


ALTER FUNCTION "public"."generate_sale_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_permissions"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select coalesce(
        array_agg(pe.code order by pe.code),
        array[]::text[]
    )
    from public.profiles pr
    join public.role_permissions rp
        on rp.role_id = pr.role_id
    join public.permissions pe
        on pe.id = rp.permission_id
    where pr.id = auth.uid()
      and pr.is_active = true;
$$;


ALTER FUNCTION "public"."get_my_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    insert into public.profiles (
        id,
        full_name
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.email
        )
    );

    return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select exists (
        select 1
        from public.profiles pr
        join public.role_permissions rp
          on rp.role_id = pr.role_id
        join public.permissions pe
          on pe.id = rp.permission_id
        where pr.id = auth.uid()
          and pr.is_active = true
          and pe.code = p_permission
    );
$$;


ALTER FUNCTION "public"."has_permission"("p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_stock"("p_branch_id" "uuid", "p_product_id" "uuid", "p_serial_numbers" "text"[], "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare
  v_qty integer;
  v_serial text;
begin

  -- Require authenticated user
  if auth.uid() is null then
    raise exception 'User is not authenticated';
  end if;

  -- Require inventory management permission
  if not (
    public.has_permission('inventory.manage_all')
    or public.has_permission('inventory.manage_branch')
  ) then
    raise exception
      'User does not have inventory management permission';
  end if;

  -- Branch managers can only receive stock for their own branch
  if p_branch_id <> public.current_user_branch_id()
     and not public.has_permission('inventory.manage_all') then
    raise exception
      'User cannot receive stock for another branch';
  end if;


  -- Determine quantity from submitted serial numbers
  v_qty := coalesce(array_length(p_serial_numbers, 1), 0);

  if v_qty <= 0 then
    raise exception 'At least one serial number is required';
  end if;


  -- Prevent duplicate serials within the submitted list
  if (
    select count(*)
    from unnest(p_serial_numbers) as t(serial_number)
  ) <> (
    select count(distinct serial_number)
    from unnest(p_serial_numbers) as t(serial_number)
  ) then
    raise exception 'Duplicate serial numbers detected';
  end if;


  -- Insert / update branch inventory
  insert into public.inventory (
    branch_id,
    product_id,
    quantity
  )
  values (
    p_branch_id,
    p_product_id,
    v_qty
  )
  on conflict (branch_id, product_id)
  do update set
    quantity = public.inventory.quantity + excluded.quantity,
    updated_at = now();


  -- Create individual serial number records
  foreach v_serial in array p_serial_numbers
  loop

    insert into public.serial_numbers (
      product_id,
      branch_id,
      serial_number,
      status,
      received_at
    )
    values (
      p_product_id,
      p_branch_id,
      trim(v_serial),
      'available',
      now()
    );

  end loop;


  -- Record inventory movement
  insert into public.inventory_movements (
    branch_id,
    product_id,
    movement_type,
    quantity,
    reference_type,
    notes,
    created_by
  )
  values (
    p_branch_id,
    p_product_id,
    'receive',
    v_qty,
    'stock_receiving',
    p_notes,
    auth.uid()
  );

end;$$;


ALTER FUNCTION "public"."receive_stock"("p_branch_id" "uuid", "p_product_id" "uuid", "p_serial_numbers" "text"[], "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_assignment"("p_user_id" "uuid", "p_role_id" "uuid", "p_branch_id" "uuid", "p_is_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if auth.uid() is null then
        raise exception 'User is not authenticated';
    end if;

    if not public.has_permission('users.manage') then
        raise exception 'User does not have user-management permission';
    end if;

    if not exists (
        select 1
        from public.roles
        where id = p_role_id
    ) then
        raise exception 'Invalid role';
    end if;

    if p_branch_id is not null
       and not exists (
           select 1
           from public.branches
           where id = p_branch_id
       ) then
        raise exception 'Invalid branch';
    end if;

    update public.profiles
    set
        role_id = p_role_id,
        branch_id = p_branch_id,
        is_active = p_is_active,
        updated_at = now()
    where id = p_user_id;

    if not found then
        raise exception 'User profile not found';
    end if;
end;
$$;


ALTER FUNCTION "public"."update_user_assignment"("p_user_id" "uuid", "p_role_id" "uuid", "p_branch_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "email" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."customer_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."customer_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_code" "text",
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "customer_type" "text" DEFAULT 'retail'::"text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['retail'::"text", 'business'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "reserved_quantity" integer DEFAULT 0 NOT NULL,
    "reorder_level" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_check" CHECK (("reserved_quantity" <= "quantity")),
    CONSTRAINT "inventory_quantity_check" CHECK (("quantity" >= 0)),
    CONSTRAINT "inventory_reserved_quantity_check" CHECK (("reserved_quantity" >= 0))
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "serial_number_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['receive'::"text", 'sale'::"text", 'return'::"text", 'transfer_in'::"text", 'transfer_out'::"text", 'adjustment_in'::"text", 'adjustment_out'::"text", 'damage'::"text", 'reserve'::"text", 'release_reservation'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "payment_method" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "reference_number" "text",
    "received_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tendered_amount" numeric(12,2),
    "change_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_change_amount_check" CHECK (("change_amount" >= (0)::numeric)),
    CONSTRAINT "payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'gcash'::"text", 'maya'::"text", 'card'::"text", 'bank_transfer'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_name" "text" NOT NULL,
    "sku" "text",
    "barcode" "text",
    "cost_price" numeric(12,2),
    "selling_price" numeric(12,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "brand_id" "uuid",
    "category_id" "uuid",
    "cost_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "selling_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "barcode" "text",
    "warranty_months" integer DEFAULT 12 NOT NULL,
    "track_serial" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "role_id" "uuid",
    "branch_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "serial_number_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sale_items_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "sale_items_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "sale_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "sale_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sale_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sale_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_number" "text" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "cashier_id" "uuid" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "sales_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'voided'::"text", 'refunded'::"text"]))),
    CONSTRAINT "sales_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "sales_total_amount_check" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."serial_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "branch_id" "uuid",
    "serial_number" "text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "received_at" timestamp with time zone,
    "sold_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "serial_numbers_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'sold'::"text", 'damaged'::"text", 'returned'::"text", 'transferred'::"text"])))
);


ALTER TABLE "public"."serial_numbers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_customer_code_key" UNIQUE ("customer_code");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_branch_id_product_id_key" UNIQUE ("branch_id", "product_id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_sale_number_key" UNIQUE ("sale_number");



ALTER TABLE ONLY "public"."serial_numbers"
    ADD CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."serial_numbers"
    ADD CONSTRAINT "serial_numbers_serial_number_key" UNIQUE ("serial_number");



CREATE OR REPLACE TRIGGER "generate_customer_code_trigger" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."generate_customer_code"();



CREATE OR REPLACE TRIGGER "generate_sale_number_trigger" BEFORE INSERT ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."generate_sale_number"();



CREATE OR REPLACE TRIGGER "set_branches_updated_at" BEFORE UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_brands_updated_at" BEFORE UPDATE ON "public"."brands" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_product_variants_updated_at" BEFORE UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_serial_numbers_updated_at" BEFORE UPDATE ON "public"."serial_numbers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "public"."serial_numbers"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "public"."serial_numbers"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."serial_numbers"
    ADD CONSTRAINT "serial_numbers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."serial_numbers"
    ADD CONSTRAINT "serial_numbers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



CREATE POLICY "Authenticated users can create customers" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can update customers" ON "public"."customers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view branches" ON "public"."branches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view brands" ON "public"."brands" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view categories" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view customers" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view inventory movements" ON "public"."inventory_movements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view product variants" ON "public"."product_variants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view sale items" ON "public"."sale_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authorized users can view profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."has_permission"('users.view'::"text")));



CREATE POLICY "Permission can create products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('products.manage'::"text"));



CREATE POLICY "Permission can update products" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('products.manage'::"text")) WITH CHECK ("public"."has_permission"('products.manage'::"text"));



CREATE POLICY "Permission can view inventory" ON "public"."inventory" FOR SELECT TO "authenticated" USING (("public"."has_permission"('inventory.view_all'::"text") OR ("public"."has_permission"('inventory.view_branch'::"text") AND ("branch_id" = "public"."current_user_branch_id"()))));



CREATE POLICY "Permission can view products" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."has_permission"('products.view'::"text"));



CREATE POLICY "Permission can view sales" ON "public"."sales" FOR SELECT TO "authenticated" USING (("public"."has_permission"('sales.view_all'::"text") OR ("public"."has_permission"('sales.view_branch'::"text") AND ("branch_id" = "public"."current_user_branch_id"()))));



CREATE POLICY "Permission can view serial numbers" ON "public"."serial_numbers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('inventory.view_all'::"text") OR ("public"."has_permission"('inventory.view_branch'::"text") AND ("branch_id" = "public"."current_user_branch_id"()))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."serial_numbers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_sale"("p_branch_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payment_method" "text", "p_payment_amount" numeric, "p_payment_reference" "text", "p_discount_amount" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_sale"("p_branch_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payment_method" "text", "p_payment_amount" numeric, "p_payment_reference" "text", "p_discount_amount" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_sale"("p_branch_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payment_method" "text", "p_payment_amount" numeric, "p_payment_reference" "text", "p_discount_amount" numeric, "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_branch_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_branch_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_branch_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_customer_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_customer_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_customer_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_sale_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_sale_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_sale_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_permissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_permission"("p_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_stock"("p_branch_id" "uuid", "p_product_id" "uuid", "p_serial_numbers" "text"[], "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_stock"("p_branch_id" "uuid", "p_product_id" "uuid", "p_serial_numbers" "text"[], "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_stock"("p_branch_id" "uuid", "p_product_id" "uuid", "p_serial_numbers" "text"[], "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_assignment"("p_user_id" "uuid", "p_role_id" "uuid", "p_branch_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_assignment"("p_user_id" "uuid", "p_role_id" "uuid", "p_branch_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_assignment"("p_user_id" "uuid", "p_role_id" "uuid", "p_branch_id" "uuid", "p_is_active" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."customer_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."customer_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."customer_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sale_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sale_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sale_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."serial_numbers" TO "anon";
GRANT ALL ON TABLE "public"."serial_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."serial_numbers" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







