import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage() {
  await requirePermission(["products.manage"]);

  const supabase = await createClient();
  const [{ data: brands }, { data: categories }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link href="/products" className="text-sm underline">
          ← Back to Products
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Add Product</h1>
        <p className="text-sm text-muted-foreground">
          Create a product and its default variant
        </p>
      </div>

      <ProductForm
        brands={brands ?? []}
        categories={categories ?? []}
      />
    </main>
  );
}
