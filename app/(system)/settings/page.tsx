import { requirePermission } from "@/lib/require-permission";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings-form";
import Link from "next/link";

export default async function SettingsPage() {
  await requirePermission(["settings.manage"]);

  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("system_settings")
    .select(`
      company_name,
      receipt_footer,
      default_warranty_months,
      currency_code,
      low_stock_threshold,
      allow_discounts,
      require_customer_for_sale,
      require_payment_reference_non_cash
    `)
    .eq("id", 1)
    .single();

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Global Phase 1 system settings
        </p>
      </div>

      <section className="tz-card mb-6 flex max-w-3xl items-center justify-between rounded-xl border p-5">
        <div>
          <h2 className="font-semibold">My Preferences</h2>
          <p className="text-sm text-muted-foreground">Theme, density, and sidebar defaults for your account</p>
        </div>
        <Link href="/settings/preferences" className="rounded-lg border px-4 py-2 text-sm font-medium">Customize</Link>
      </section>

      <div className="mb-3 max-w-3xl border-t pt-6">
        <h2 className="text-lg font-semibold">Global System Settings</h2>
        <p className="text-sm text-muted-foreground">Business rules shared across TechZone POS</p>
      </div>

      {error || !settings ? (
        <p className="text-sm text-red-500">
          Failed to load system settings.
        </p>
      ) : (
        <SettingsForm settings={settings} />
      )}
    </main>
  );
}
