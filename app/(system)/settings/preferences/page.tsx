import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PreferencesForm } from "@/components/preferences-form";
import type { AppearancePreferences } from "@/components/theme-shell";

const defaults: AppearancePreferences = {
  theme: "modern_dark",
  density: "comfortable",
  sidebar_default: "expanded",
};

export default async function PreferencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data } = await supabase
    .from("user_preferences")
    .select("theme, density, sidebar_default")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (
    <main className="p-6">
      <header className="mb-6">
        <p className="text-xs font-medium text-primary">Settings / Personal</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">My Preferences</h1>
        <p className="mt-1 text-xs text-muted-foreground">Appearance and workspace defaults for your account only</p>
      </header>
      <PreferencesForm
        userId={user.id}
        preferences={(data as AppearancePreferences | null) ?? defaults}
      />
    </main>
  );
}
