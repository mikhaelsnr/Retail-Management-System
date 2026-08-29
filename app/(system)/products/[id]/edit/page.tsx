import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { ProductForm } from "@/components/product-form";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  await requirePermission(["products.manage"]);

  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: product, error },
    { data: brands },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(`
        id,
        name,
        brand_id,
        category_id,
        sku,
        cost_price,
        selling_price,
        warranty_months,
        track_serial,
        is_active
      `)
      .eq("id", id)
      .single(),
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (error || !product) {
    notFound();
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link href="/products" className="text-sm underline">
          ← Back to Products
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Edit Product</h1>
        <p className="text-sm text-muted-foreground">
          Update the product and its default variant
        </p>
      </div>

      <ProductForm
        brands={brands ?? []}
        categories={categories ?? []}
        product={{
          ...product,
          cost_price: Number(product.cost_price),
          selling_price: Number(product.selling_price),
          warranty_months: Number(product.warranty_months),
        }}
      />
    </main>
  );
}
