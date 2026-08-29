alter table public.inventory
  add constraint inventory_reorder_level_nonnegative_check
  check (reorder_level >= 0) not valid;

alter table public.inventory
  validate constraint inventory_reorder_level_nonnegative_check;

create or replace function public.default_inventory_reorder_level()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select low_stock_threshold from public.system_settings where id = 1),
    0
  );
$$;

alter table public.inventory
  alter column reorder_level
  set default public.default_inventory_reorder_level();

revoke all on function public.default_inventory_reorder_level() from public;
grant execute on function public.default_inventory_reorder_level() to authenticated;
grant execute on function public.default_inventory_reorder_level() to service_role;

create or replace function public.update_inventory_reorder_level(
  p_inventory_id uuid,
  p_reorder_level integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inventory_branch_id uuid;
  v_assigned_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Reorder level must be a nonnegative integer';
  end if;

  select inventory.branch_id
    into v_inventory_branch_id
    from public.inventory
    where inventory.id = p_inventory_id;

  if not found then
    raise exception 'Inventory record not found';
  end if;

  if public.has_permission('inventory.manage_all') then
    null;
  elsif public.has_permission('inventory.manage_branch') then
    select profiles.branch_id
      into v_assigned_branch_id
      from public.profiles
      where profiles.id = v_user_id
        and profiles.is_active = true;

    if v_assigned_branch_id is null then
      raise exception 'Your account is inactive or does not have an assigned branch';
    end if;

    if v_assigned_branch_id is distinct from v_inventory_branch_id then
      raise exception 'You can only update inventory for your assigned branch';
    end if;
  else
    raise exception 'You do not have permission to update inventory reorder levels';
  end if;

  update public.inventory
    set reorder_level = p_reorder_level,
        updated_at = now()
    where id = p_inventory_id;
end;
$$;

revoke all on function public.update_inventory_reorder_level(uuid, integer)
  from public, anon;
grant execute on function public.update_inventory_reorder_level(uuid, integer)
  to authenticated;
grant execute on function public.update_inventory_reorder_level(uuid, integer)
  to service_role;
