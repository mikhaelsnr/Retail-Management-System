-- Additive branch management and one global Phase 1 settings record.

insert into public.permissions (code, description)
values ('branches.manage', 'Create and update branches')
on conflict (code) do nothing;

-- Roles that already have global branch visibility receive branch management.
-- This derives access from permissions rather than hard-coded role names.
insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, manage_permission.id
from public.role_permissions as existing
join public.permissions as view_permission
  on view_permission.id = existing.permission_id
 and view_permission.code = 'branches.view_all'
cross join public.permissions as manage_permission
where manage_permission.code = 'branches.manage'
on conflict (role_id, permission_id) do nothing;

create policy "Permission can create branches"
on public.branches
for insert
to authenticated
with check (public.has_permission('branches.manage'));

create policy "Permission can update branches"
on public.branches
for update
to authenticated
using (public.has_permission('branches.manage'))
with check (public.has_permission('branches.manage'));

create table public.system_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'TechZone POS',
  receipt_footer text not null default 'Thank you for your purchase.',
  default_warranty_months integer not null default 12
    check (default_warranty_months >= 0),
  currency_code text not null default 'PHP'
    check (currency_code = 'PHP'),
  low_stock_threshold integer not null default 5
    check (low_stock_threshold >= 0),
  allow_discounts boolean not null default true,
  require_customer_for_sale boolean not null default false,
  require_payment_reference_non_cash boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;

create policy "Permission can view system settings"
on public.system_settings
for select
to authenticated
using (public.has_permission('settings.manage'));

create policy "Permission can update system settings"
on public.system_settings
for update
to authenticated
using (public.has_permission('settings.manage'))
with check (
  id = 1
  and public.has_permission('settings.manage')
);

revoke all on table public.system_settings from public, anon;
grant select, update on table public.system_settings to authenticated;
grant all on table public.system_settings to service_role;

create trigger set_system_settings_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();
