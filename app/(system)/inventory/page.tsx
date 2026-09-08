import { Pagination } from "@/components/pagination";
import { getPage, PAGE_SIZE, type PageSearchParams } from "@/lib/pagination";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { EditReorderLevel } from "@/components/edit-reorder-level";
import { StatusBadge } from "@/components/status-badge";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const page = getPage(params);
  const { profile, permissions } = await requirePermission([
    "inventory.view_all",
    "inventory.view_branch",
    "inventory.manage_all",
    "inventory.manage_branch",
  ]);

  const supabase = await createClient();

  const canManageAll = permissions.includes("inventory.manage_all");
  const canManageBranch = permissions.includes("inventory.manage_branch");

  const { data: inventoryRows, error } = await supabase
    .from("inventory")
    .select(`
      id,
      quantity,
      reserved_quantity,
      reorder_level,
      product:products (
        id,
        sku,
        name
      ),
      branch:branches (
        id,
        name
      )
    `)
    .order("created_at")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const inventory = inventoryRows?.slice(0, PAGE_SIZE);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Inventory</h1>

        <p className="mt-4 text-red-500">
          Failed to load inventory.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Inventory
          </h1>

          <p className="text-sm text-muted-foreground">
            Stock by branch
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/inventory/movements"
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Movement History
          </Link>

          <Link
            href="/inventory/receive"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Receive Stock
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 text-left">
                Branch
              </th>

              <th className="p-3 text-left">
                SKU
              </th>

              <th className="p-3 text-left">
                Product
              </th>

              <th className="p-3 text-right">
                Quantity
              </th>

              <th className="p-3 text-right">
                Reserved
              </th>

              <th className="p-3 text-right">
                Available
              </th>

              <th className="p-3 text-right">
                Reorder Level
              </th>

              <th className="p-3 text-left">
                Status
              </th>

              <th className="p-3 text-left">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {inventory?.map((item) => {
              const branch = Array.isArray(item.branch)
                ? (item.branch[0] ?? null)
                : item.branch;
              const product = Array.isArray(item.product)
                ? (item.product[0] ?? null)
                : item.product;
              const available =
                item.quantity - item.reserved_quantity;

              const lowStock =
                available <= item.reorder_level;

              const canEdit =
                canManageAll === true ||
                (canManageBranch === true &&
                  profile?.branch_id === branch?.id);

              return (
                <tr
                  key={item.id}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3">
                    {branch?.name ?? "-"}
                  </td>

                  <td className="p-3">
                    {product?.sku ?? "-"}
                  </td>

                  <td className="p-3 font-medium">
                    {product?.name ?? "-"}
                  </td>

                  <td className="p-3 text-right">
                    {item.quantity}
                  </td>

                  <td className="p-3 text-right">
                    {item.reserved_quantity}
                  </td>

                  <td className="p-3 text-right">
                    {available}
                  </td>

                  <td className="p-3 text-right">
                    {canEdit ? (
                      <EditReorderLevel
                        inventoryId={item.id}
                        initialValue={item.reorder_level}
                        branchName={branch?.name ?? "Unknown branch"}
                        productName={product?.name ?? "Unknown product"}
                      />
                    ) : (
                      item.reorder_level
                    )}
                  </td>

                  <td className="p-3">
                    <StatusBadge status={lowStock ? "Low Stock" : "In Stock"} />
                  </td>

                  <td className="p-3 align-top">
                    <Link
                      href={`/inventory/${item.id}`}
                      className="text-sm underline"
                    >
                      View Units
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination path="/inventory" params={params} page={page} hasNext={(inventoryRows?.length ?? 0) > PAGE_SIZE} />
    </main>
  );
}
