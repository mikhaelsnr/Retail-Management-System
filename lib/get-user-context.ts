import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppearancePreferences } from "@/components/theme-shell";

// React cache is scoped to a Server Component request, never shared across users.
export const getCurrentUserContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [profileResult, permissionResult, preferenceResult] = await Promise.all([
    supabase.from("profiles").select(`
      id, full_name, phone, is_active, role_id, branch_id,
      role:roles!profiles_role_id_fkey (id, name),
      branch:branches!profiles_branch_id_fkey (id, code, name)
    `).eq("id", user.id).single(),
    supabase.rpc("get_my_permissions"),
    supabase.from("user_preferences").select("theme, density, sidebar_default")
      .eq("profile_id", user.id).maybeSingle(),
  ]);
  if (profileResult.error || !profileResult.data?.is_active) redirect("/auth/login");
  if (permissionResult.error) throw new Error("Failed to load user permissions.");
  if (preferenceResult.error) throw new Error("Failed to load user preferences.");

  const raw = profileResult.data;
  const profile = {
    ...raw,
    role: (Array.isArray(raw.role) ? raw.role[0] ?? null : raw.role) as { id: string; name: string } | null,
    branch: (Array.isArray(raw.branch) ? raw.branch[0] ?? null : raw.branch) as { id: string; code: string; name: string } | null,
  };
  const permissions: string[] = Array.isArray(permissionResult.data)
    ? permissionResult.data.filter((value): value is string => typeof value === "string") : [];
  const preferences: AppearancePreferences = preferenceResult.data as AppearancePreferences | null ?? {
    theme: "plain_dark", density: "comfortable", sidebar_default: "expanded",
  };
  return { user, profile, role: profile.role, branch: profile.branch, permissions, preferences };
});
