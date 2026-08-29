"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppearancePreferences } from "@/components/theme-shell";

const themes = [
  ["plain_dark", "Plain dark"],
  ["plain_light", "Plain light"],
  ["modern_dark", "Modern dark enterprise"],
  ["studio_dark", "Studio dark workspace"],
  ["light_retail", "Light retail POS"],
  ["hybrid", "Dark POS + light management"],
  ["blue_accent", "TechZone blue accent"],
] as const;

export function PreferencesForm({
  userId,
  preferences,
}: {
  userId: string;
  preferences: AppearancePreferences;
}) {
  const router = useRouter();
  const [values, setValues] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const { error: saveError } = await createClient()
      .from("user_preferences")
      .upsert({ profile_id: userId, ...values }, { onConflict: "profile_id" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Preferences saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="tz-card max-w-3xl space-y-5 rounded-xl border p-5 text-sm">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Theme</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm hover:bg-muted/50">
              <input
                type="radio"
                name="theme"
                checked={values.theme === value}
                onChange={() => setValues({ ...values, theme: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="UI Density"
          value={values.density}
          onChange={(density) => setValues({ ...values, density: density as AppearancePreferences["density"] })}
          options={[["comfortable", "Comfortable"], ["compact", "Compact"]]}
        />
        <Select
          label="Sidebar Default"
          value={values.sidebar_default}
          onChange={(sidebar_default) => setValues({ ...values, sidebar_default: sidebar_default as AppearancePreferences["sidebar_default"] })}
          options={[["expanded", "Expanded"], ["collapsed", "Collapsed"]]}
        />
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button disabled={saving} className="tz-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </form>
  );
}

function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm">
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  );
}
