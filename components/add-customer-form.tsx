"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddCustomerForm() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [customerType, setCustomerType] =
    useState("retail");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    setLoading(true);

    const { data, error: insertError } = await supabase
      .from("customers")
      .insert({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        customer_type: customerType,
        notes: notes.trim() || null,
      })
      .select("id")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/customers");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl space-y-6 rounded-lg border p-6"
    >
      <div>
        <label className="mb-2 block text-sm font-medium">
          Full Name
        </label>

        <input
          value={fullName}
          onChange={(e) =>
            setFullName(e.target.value)
          }
          className="w-full rounded-md border bg-background p-2"
          placeholder="Customer name"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Phone
          </label>

          <input
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            className="w-full rounded-md border bg-background p-2"
            placeholder="09XXXXXXXXX"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="w-full rounded-md border bg-background p-2"
            placeholder="customer@email.com"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Address
        </label>

        <textarea
          value={address}
          onChange={(e) =>
            setAddress(e.target.value)
          }
          rows={3}
          className="w-full rounded-md border bg-background p-3"
          placeholder="Customer address"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Customer Type
        </label>

        <select
          value={customerType}
          onChange={(e) =>
            setCustomerType(e.target.value)
          }
          className="w-full rounded-md border bg-background p-2"
        >
          <option value="retail">
            Retail
          </option>

          <option value="business">
            Business
          </option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Notes
        </label>

        <textarea
          value={notes}
          onChange={(e) =>
            setNotes(e.target.value)
          }
          rows={3}
          className="w-full rounded-md border bg-background p-3"
          placeholder="Optional notes"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : "Save Customer"}
        </button>

        <button
          type="button"
          onClick={() =>
            router.push("/customers")
          }
          className="rounded-md border px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}