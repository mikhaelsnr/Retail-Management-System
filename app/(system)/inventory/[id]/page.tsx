import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

type InventoryBranch = {
  id: string;
  name: string;
  code: string;
};

type InventoryProduct = {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  warranty_months: number;
};

export default async function InventoryDetailPage({
  params,
}: Props) {
  await requirePermission([
    "inventory.view_all",
    "inventory.view_branch",
    "inventory.manage_all",
    "inventory.manage_branch",
  ]);

  const { id } = await params;

  const supabase = await createClient();

  const { data: inventory, error } = await supabase
    .from("inventory")
    .select(`
      id,
      quantity,
      reserved_quantity,
      reorder_level,
      branch:branches (
        id,
        name,
        code
      ),
      product:products (
        id,
        sku,
        name,
        selling_price,
        warranty_months
      )
    `)
    .eq("id", id)
    .single()
    .overrideTypes<{
      branch: InventoryBranch | null;
      product: InventoryProduct | null;
    }>();

  if (error || !inventory) {
    notFound();
  }

  const { data: serials, error: serialError } = await supabase
    .from("serial_numbers")
    .select(`
      id,
      serial_number,
      status,
      received_at,
      sold_at,
      created_at
    `)
    .eq("branch_id", inventory.branch?.id)
    .eq("product_id", inventory.product?.id)
    .order("created_at", {
      ascending: true,
    });

  if (serialError) {
    return (
      <main className="p-6">
        <p className="text-red-500">
          Failed to load serial numbers.
        </p>
      </main>
    );
  }

  const available =
    inventory.quantity -
    inventory.reserved_quantity;

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link
          href="/inventory"
          className="text-sm underline"
        >
          ← Back to Inventory
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {inventory.product?.name}
        </h1>

        <p className="text-sm text-muted-foreground">
          {inventory.branch?.name}
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            SKU
          </p>
          <p className="mt-1 font-medium">
            {inventory.product?.sku}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Quantity
          </p>
          <p className="mt-1 text-xl font-bold">
            {inventory.quantity}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Reserved
          </p>
          <p className="mt-1 text-xl font-bold">
            {inventory.reserved_quantity}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Available
          </p>
          <p className="mt-1 text-xl font-bold">
            {available}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">
            Units / Serial Numbers
          </h2>

          <p className="text-sm text-muted-foreground">
            Individual units assigned to this branch
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left">
                  Serial Number
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

                <th className="p-3 text-left">
                  Received
                </th>

                <th className="p-3 text-left">
                  Sold
                </th>
              </tr>
            </thead>

            <tbody>
              {serials?.length ? (
                serials.map((serial) => (
                  <tr
                    key={serial.id}
                    className="border-b last:border-b-0"
                  >
                    <td className="p-3 font-mono">
                      {serial.serial_number}
                    </td>

                    <td className="p-3 capitalize">
                      {serial.status}
                    </td>

                    <td className="p-3">
                      {serial.received_at
                        ? new Date(
                            serial.received_at
                          ).toLocaleString()
                        : "-"}
                    </td>

                    <td className="p-3">
                      {serial.sold_at
                        ? new Date(
                            serial.sold_at
                          ).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No serial numbers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
