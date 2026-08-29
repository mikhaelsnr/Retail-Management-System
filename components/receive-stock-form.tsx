"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Branch = {
  id: string;
  name: string;
  code: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  track_serial: boolean;
  brand: {
    name: string;
  } | null;
};

type Props = {
  branches: Branch[];
  assignedBranch: Branch | null;
  canSelectBranch: boolean;
  products: Product[];
};

export function ReceiveStockForm({
  branches,
  assignedBranch,
  canSelectBranch,
  products,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [branchId, setBranchId] = useState(
    canSelectBranch ? "" : (assignedBranch?.id ?? "")
  );
  const [productId, setProductId] = useState("");
  const [serialText, setSerialText] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const serialNumbers = serialText
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!branchId) {
      setError("Select a branch.");
      return;
    }

    if (!productId) {
      setError("Select a product.");
      return;
    }

    if (serialNumbers.length === 0) {
      setError("Enter at least one serial number.");
      return;
    }

    const uniqueSerials = new Set(serialNumbers);

    if (uniqueSerials.size !== serialNumbers.length) {
      setError("Duplicate serial numbers found.");
      return;
    }

    setLoading(true);

    const { error: rpcError } = await supabase.rpc(
      "receive_stock_authorized",
      {
        p_branch_id: branchId,
        p_product_id: productId,
        p_serial_numbers: serialNumbers,
        p_notes: notes || null,
      }
    );

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage(
      `${serialNumbers.length} unit(s) received successfully.`
    );

    setSerialText("");
    setNotes("");

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl space-y-6 rounded-lg border p-6"
    >
      {canSelectBranch ? (
        <div>
          <label className="mb-2 block text-sm font-medium">
            Branch
          </label>

          <select
            value={branchId}
            onChange={(event) =>
              setBranchId(event.target.value)
            }
            className="w-full rounded-md border bg-background p-2"
          >
            <option value="">Select branch</option>

            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 p-3">
          <span className="text-sm text-muted-foreground">
            Receiving Branch:
          </span>{" "}
          <span className="font-medium">
            {assignedBranch?.name}
          </span>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">
          Product
        </label>

        <select
          value={productId}
          onChange={(event) =>
            setProductId(event.target.value)
          }
          className="w-full rounded-md border bg-background p-2"
        >
          <option value="">
            Select product
          </option>

          {products.map((product) => (
            <option
              key={product.id}
              value={product.id}
            >
              {product.sku} — {product.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Serial Numbers
        </label>

        <textarea
          value={serialText}
          onChange={(event) =>
            setSerialText(event.target.value)
          }
          rows={8}
          placeholder={`Enter one serial number per line

Example:
ASUS-001
ASUS-002
ASUS-003`}
          className="w-full rounded-md border bg-background p-3 font-mono text-sm"
        />

        <p className="mt-2 text-sm text-muted-foreground">
          Quantity: {serialNumbers.length}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Notes
        </label>

        <textarea
          value={notes}
          onChange={(event) =>
            setNotes(event.target.value)
          }
          rows={3}
          placeholder="Optional receiving notes"
          className="w-full rounded-md border bg-background p-3"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">
          {error}
        </p>
      )}

      {message && (
        <p className="text-sm text-green-500">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
      >
        {loading
          ? "Receiving..."
          : `Receive ${serialNumbers.length || ""} Unit(s)`}
      </button>
    </form>
  );
}
