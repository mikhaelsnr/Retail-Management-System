update public.user_preferences
set theme = 'plain_dark'
where theme = 'blue_accent';

alter table public.user_preferences
  drop constraint user_preferences_theme_check;

alter table public.user_preferences
  add constraint user_preferences_theme_check
  check (theme in (
    'plain_dark',
    'plain_light',
    'modern_dark',
    'studio_dark',
    'light_retail',
    'hybrid'
  ));
