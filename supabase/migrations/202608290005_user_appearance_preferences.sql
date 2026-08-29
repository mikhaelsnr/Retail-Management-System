create table public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'modern_dark'
    check (theme in ('modern_dark', 'light_retail', 'hybrid', 'blue_accent')),
  density text not null default 'comfortable'
    check (density in ('comfortable', 'compact')),
  sidebar_default text not null default 'expanded'
    check (sidebar_default in ('expanded', 'collapsed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users can view own preferences"
on public.user_preferences for select to authenticated
using (profile_id = auth.uid());

create policy "Users can create own preferences"
on public.user_preferences for insert to authenticated
with check (profile_id = auth.uid());

create policy "Users can update own preferences"
on public.user_preferences for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

revoke all on table public.user_preferences from public, anon;
grant select, insert, update on table public.user_preferences to authenticated;
grant all on table public.user_preferences to service_role;

create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();
