import { getCurrentUserContext } from "@/lib/get-user-context";
import { PreferencesForm } from "@/components/preferences-form";

export default async function PreferencesPage() {
  const { user, preferences } = await getCurrentUserContext();

  return (
    <main className="p-6">
      <header className="mb-6">
        <p className="text-xs font-medium text-primary">Settings / Personal</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">My Preferences</h1>
        <p className="mt-1 text-xs text-muted-foreground">Appearance and workspace defaults for your account only</p>
      </header>
      <PreferencesForm
        userId={user.id}
        preferences={preferences}
      />
    </main>
  );
}
