import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { StatusBadge } from "@/components/status-badge";

type ProductsPageProps = {
  searchParams: Promise<{
    success?: string;
  }>;
};

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  await requirePermission([
    "products.view",
    "products.manage",
  ]);

  const supabase = await createClient();
  const params = await searchParams;

  const { data: canManageProducts } = await supabase.rpc(
    "has_permission",
    {
      p_permission: "products.manage",
    }
  );

  const { data: products, error } = await supabase
    .from("products")
    .select(`
      id,
      sku,
      name,
      cost_price,
      selling_price,
      warranty_months,
      track_serial,
      is_active,
      brand:brands (
        name
      ),
      category:categories (
        name
      )
    `)
    .order("name");

  const normalizedProducts = products?.map((product) => ({
    ...product,
    brand: Array.isArray(product.brand)
      ? (product.brand[0] ?? null)
      : product.brand,
    category: Array.isArray(product.category)
      ? (product.category[0] ?? null)
      : product.category,
  }));

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="mt-4 text-red-500">
          Failed to load products.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">
            Product master list
          </p>
        </div>

        {canManageProducts === true && (
          <Link
            href="/products/new"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Add Product
          </Link>
        )}
      </div>

      {params.success && (
        <p className="mb-4 rounded-md border border-green-500/50 p-3 text-sm text-green-500">
          {params.success === "updated"
            ? "Product updated successfully."
            : "Product created successfully."}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Brand</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-right">Cost</th>
              <th className="p-3 text-right">Selling Price</th>
              <th className="p-3 text-center">Warranty</th>
              <th className="p-3 text-center">Serial</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {normalizedProducts?.map((product) => (
              <tr
                key={product.id}
                className="border-b last:border-b-0"
              >
                <td className="p-3">{product.sku}</td>
                <td className="p-3 font-medium">{product.name}</td>
                <td className="p-3">
                  {product.brand?.name ?? "-"}
                </td>
                <td className="p-3">
                  {product.category?.name ?? "-"}
                </td>
                <td className="p-3 text-right">
                  ₱{Number(product.cost_price).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  ₱{Number(product.selling_price).toLocaleString()}
                </td>
                <td className="p-3 text-center">
                  {product.warranty_months} mo.
                </td>
                <td className="p-3 text-center">
                  {product.track_serial ? "Yes" : "No"}
                </td>
                <td className="p-3 text-center">
                  <StatusBadge status={product.is_active ? "Active" : "Inactive"} />
                </td>
                <td className="p-3">
                  {canManageProducts === true ? (
                    <Link
                      href={`/products/${product.id}/edit`}
                      className="text-sm underline"
                    >
                      Edit
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
