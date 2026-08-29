-- Enforce branch scope before delegating to the existing stock-receiving RPC.
-- The existing public.receive_stock function remains responsible for serial
-- creation, inventory quantity updates, movement logging, and notes.

create or replace function public.receive_stock_authorized(
  p_branch_id uuid,
  p_product_id uuid,
  p_serial_numbers text[],
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_assigned_branch_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
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
      raise exception 'Your account does not have an assigned branch';
    end if;

    if p_branch_id is distinct from v_assigned_branch_id then
      raise exception 'You can only receive stock for your assigned branch';
    end if;
  else
    raise exception 'You do not have permission to receive stock';
  end if;

  perform public.receive_stock(
    p_branch_id,
    p_product_id,
    p_serial_numbers,
    p_notes
  );
end;
$$;

revoke all on function public.receive_stock_authorized(
  uuid,
  uuid,
  text[],
  text
) from public;

grant execute on function public.receive_stock_authorized(
  uuid,
  uuid,
  text[],
  text
) to authenticated;

-- Prevent authenticated clients from bypassing the scoped wrapper.
revoke execute on function public.receive_stock(
  uuid,
  uuid,
  text[],
  text
) from public, anon, authenticated;
