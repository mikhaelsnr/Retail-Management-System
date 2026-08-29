"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  inventoryId: string;
  initialValue: number;
  branchName: string;
  productName: string;
};

export function EditReorderLevel(p: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(p.initialValue);
  const [value, setValue] = useState(String(p.initialValue));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function cancel() {
    setValue(String(current));
    setError("");
    setEditing(false);
  }

  async function save() {
    const parsed = Number(value.trim());
    setError("");
    setMessage("");
    if (!value.trim() || !Number.isInteger(parsed) || parsed < 0) {
      setError("Enter a nonnegative whole number.");
      return;
    }
    setSaving(true);
    const { error: rpcError } = await createClient().rpc(
      "update_inventory_reorder_level",
      { p_inventory_id: p.inventoryId, p_reorder_level: parsed }
    );
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setCurrent(parsed);
    setValue(String(parsed));
    setEditing(false);
    setMessage("Reorder level updated.");
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="mt-1">
        <button type="button" onClick={() => setEditing(true)} className="text-sm underline">
          Edit Reorder Level
        </button>
        {message && <p className="text-xs text-green-500">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 min-w-52 rounded-md border bg-background p-3">
      <label className="text-xs">
        Reorder level for {p.productName} at {p.branchName}
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          className="mt-1 w-full rounded-md border bg-background p-2"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="rounded-md bg-white px-3 py-1 text-xs text-black">
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={cancel} disabled={saving} className="rounded-md border px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
