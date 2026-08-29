"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BranchValues = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type BranchFormProps = {
  branch?: BranchValues;
};

export function BranchForm({ branch }: BranchFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState(branch?.code ?? "");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [email, setEmail] = useState(branch?.email ?? "");
  const [isActive, setIsActive] = useState(branch?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode || !name.trim()) {
      setError("Branch code and name are required.");
      return;
    }

    setLoading(true);

    let duplicateQuery = supabase
      .from("branches")
      .select("id")
      .eq("code", normalizedCode)
      .limit(1);

    if (branch) {
      duplicateQuery = duplicateQuery.neq("id", branch.id);
    }

    const { data: duplicate } = await duplicateQuery.maybeSingle();

    if (duplicate) {
      setLoading(false);
      setError("That branch code is already in use.");
      return;
    }

    const values = {
      code: normalizedCode,
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      is_active: isActive,
    };

    const result = branch
      ? await supabase.from("branches").update(values).eq("id", branch.id)
      : await supabase.from("branches").insert(values);

    setLoading(false);

    if (result.error) {
      setError(
        result.error.code === "23505"
          ? "That branch code is already in use."
          : result.error.message
      );
      return;
    }

    router.push(
      `/branches?success=${branch ? "updated" : "created"}`
    );
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl space-y-6 rounded-lg border p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Branch Code">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2 font-mono"
          />
        </Field>
        <Field label="Branch Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>
      </div>

      <Field label="Address">
        <textarea
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          rows={3}
          className="w-full rounded-md border bg-background p-2"
        />
      </Field>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        Active
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {loading ? "Saving..." : branch ? "Update Branch" : "Add Branch"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/branches")}
          disabled={loading}
          className="rounded-md border px-4 py-2 font-medium"
        >
          Cancel
        </button>
      </div>
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
