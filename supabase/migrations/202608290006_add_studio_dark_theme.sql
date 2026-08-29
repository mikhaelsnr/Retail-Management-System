alter table public.user_preferences
  drop constraint user_preferences_theme_check;

alter table public.user_preferences
  add constraint user_preferences_theme_check
  check (theme in (
    'modern_dark',
    'studio_dark',
    'light_retail',
    'hybrid',
    'blue_accent'
  ));
