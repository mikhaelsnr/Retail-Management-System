import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { ReceiveStockForm } from "@/components/receive-stock-form";

export default async function ReceiveStockPage() {
  const { branch: assignedBranch, permissions } = await requirePermission([
    "inventory.manage_all",
    "inventory.manage_branch",
  ]);

  const supabase = await createClient();

  const hasGlobalManagement = permissions.includes("inventory.manage_all");

  const { data: allBranches } = hasGlobalManagement
    ? await supabase
        .from("branches")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name")
    : { data: null };

  const { data: products } = await supabase
    .from("products")
    .select(`
      id,
      sku,
      name,
      track_serial,
      brand:brands (
        name
      )
    `)
    .eq("is_active", true)
    .order("name");

  const normalizedProducts = products?.map((product) => ({
    ...product,
    brand: Array.isArray(product.brand)
      ? (product.brand[0] ?? null)
      : product.brand,
  }));

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Receive Stock
        </h1>

        <p className="text-sm text-muted-foreground">
          Add incoming products to branch inventory
        </p>
      </div>

      {!hasGlobalManagement && !assignedBranch ? (
        <div className="max-w-2xl rounded-lg border border-red-500/50 p-6">
          <p className="font-medium text-red-500">
            Receiving is unavailable.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have an assigned branch. Ask an
            administrator to assign one before receiving stock.
          </p>
        </div>
      ) : (
        <ReceiveStockForm
          branches={allBranches ?? []}
          assignedBranch={assignedBranch ?? null}
          canSelectBranch={hasGlobalManagement}
          products={normalizedProducts ?? []}
        />
      )}
    </main>
  );
}
