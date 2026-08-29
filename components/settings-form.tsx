"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Settings = {
  company_name: string;
  receipt_footer: string;
  default_warranty_months: number;
  currency_code: string;
  low_stock_threshold: number;
  allow_discounts: boolean;
  require_customer_for_sale: boolean;
  require_payment_reference_non_cash: boolean;
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const supabase = createClient();
  const [values, setValues] = useState(settings);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!values.company_name.trim()) {
      setError("Store / company name is required.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase
      .from("system_settings")
      .update({
        ...values,
        company_name: values.company_name.trim(),
        receipt_footer: values.receipt_footer.trim(),
        currency_code: "PHP",
      })
      .eq("id", 1);
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Settings saved.");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl space-y-6 rounded-lg border p-6"
    >
      <Field label="Store / Company Name">
        <input
          value={values.company_name}
          onChange={(event) => update("company_name", event.target.value)}
          required
          className="w-full rounded-md border bg-background p-2"
        />
      </Field>

      <Field label="Receipt Footer Text">
        <textarea
          value={values.receipt_footer}
          onChange={(event) => update("receipt_footer", event.target.value)}
          rows={3}
          className="w-full rounded-md border bg-background p-2"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Default Warranty (months)">
          <input
            type="number"
            min="0"
            step="1"
            value={values.default_warranty_months}
            onChange={(event) =>
              update("default_warranty_months", Number(event.target.value))
            }
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>
        <Field label="Currency">
          <input
            value="PHP"
            readOnly
            className="w-full rounded-md border bg-muted/30 p-2 text-muted-foreground"
          />
        </Field>
        <Field label="Low-stock Default Threshold">
          <input
            type="number"
            min="0"
            step="1"
            value={values.low_stock_threshold}
            onChange={(event) =>
              update("low_stock_threshold", Number(event.target.value))
            }
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>
      </div>

      <div className="space-y-3">
        <Toggle
          label="Allow discounts"
          checked={values.allow_discounts}
          onChange={(checked) => update("allow_discounts", checked)}
        />
        <Toggle
          label="Require customer for sale"
          checked={values.require_customer_for_sale}
          onChange={(checked) => update("require_customer_for_sale", checked)}
        />
        <Toggle
          label="Require payment reference for non-cash payments"
          checked={values.require_payment_reference_non_cash}
          onChange={(checked) =>
            update("require_payment_reference_non_cash", checked)
          }
        />
      </div>

      {message && <p className="text-sm text-green-500">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save Settings"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
