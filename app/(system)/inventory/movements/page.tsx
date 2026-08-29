import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";

export default async function InventoryMovementsPage() {
  await requirePermission([
    "inventory.view_all",
    "inventory.view_branch",
    "inventory.manage_all",
    "inventory.manage_branch",
  ]);

  const supabase = await createClient();

  const { data: movements, error } = await supabase
    .from("inventory_movements")
    .select(`
      id,
      movement_type,
      quantity,
      reference_type,
      notes,
      created_at,
      branch:branches (
        name,
        code
      ),
      product:products (
        sku,
        name
      ),
      serial:serial_numbers (
        serial_number
      ),
      user:profiles!inventory_movements_created_by_fkey (
        full_name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">
          Inventory Movements
        </h1>

        <p className="mt-4 text-red-500">
          Failed to load inventory movements.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Inventory Movements
          </h1>

          <p className="text-sm text-muted-foreground">
            Complete inventory activity history
          </p>
        </div>

        <Link
          href="/inventory"
          className="text-sm underline"
        >
          ← Back to Inventory
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Branch</th>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Movement</th>
              <th className="p-3 text-right">Quantity</th>
              <th className="p-3 text-left">Serial</th>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Notes</th>
            </tr>
          </thead>

          <tbody>
            {movements?.length ? (
              movements.map((movement) => (
                <tr
                  key={movement.id}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3">
                    {new Date(
                      movement.created_at
                    ).toLocaleString()}
                  </td>

                  <td className="p-3">
                    {movement.branch?.name ?? "-"}
                  </td>

                  <td className="p-3 font-mono">
                    {movement.product?.sku ?? "-"}
                  </td>

                  <td className="p-3">
                    {movement.product?.name ?? "-"}
                  </td>

                  <td className="p-3 capitalize">
                    {movement.movement_type.replaceAll(
                      "_",
                      " "
                    )}
                  </td>

                  <td className="p-3 text-right">
                    {movement.quantity}
                  </td>

                  <td className="p-3 font-mono">
                    {movement.serial?.serial_number ?? "-"}
                  </td>

                  <td className="p-3">
                    {movement.user?.full_name ?? "-"}
                  </td>

                  <td className="p-3">
                    {movement.notes ?? "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={9}
                  className="p-6 text-center text-muted-foreground"
                >
                  No inventory movements found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
