import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeShell, type AppearancePreferences } from "@/components/theme-shell";

export default function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<SystemLayoutFallback />}>
      <AuthenticatedSystemLayout>{children}</AuthenticatedSystemLayout>
    </Suspense>
  );
}

async function AuthenticatedSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      is_active,
      role:roles!profiles_role_id_fkey (
        id,
        name
      ),
      branch:branches!profiles_branch_id_fkey (
        id,
        code,
        name
      )
    `)
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/auth/login");
  }

  type ProfileBranch = {
    id: string;
    code: string;
    name: string;
  };

  const branch = profile.branch as unknown as ProfileBranch | null;

  const { data: permissionData } = await supabase.rpc(
    "get_my_permissions"
  );

  const permissions: string[] = Array.isArray(permissionData)
    ? permissionData.filter(
        (permission): permission is string =>
          typeof permission === "string"
      )
    : [];

  const { data: preferenceData } = await supabase
    .from("user_preferences")
    .select("theme, density, sidebar_default")
    .eq("profile_id", user.id)
    .maybeSingle();

  const preferences: AppearancePreferences =
    (preferenceData as AppearancePreferences | null) ?? {
      theme: "plain_dark",
      density: "comfortable",
      sidebar_default: "expanded",
    };

  return (
    <ThemeShell
      preferences={preferences}
      sidebar={<AppSidebar
        permissions={permissions}
        fullName={profile.full_name ?? user.email ?? "User"}
        branchName={branch?.name ?? "No branch"}
        defaultCollapsed={preferences.sidebar_default === "collapsed"}
        plain={preferences.theme === "plain_dark" || preferences.theme === "plain_light"}
      />}
    >
      {children}
    </ThemeShell>
  );
}

function SystemLayoutFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading your workspace...</p>
    </div>
  );
}
