import { Suspense } from "react";
import { getCurrentUserContext } from "@/lib/get-user-context";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeShell } from "@/components/theme-shell";

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
  const { user, profile, branch, permissions, preferences } = await getCurrentUserContext();

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
