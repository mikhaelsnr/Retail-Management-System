"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Option = {
  id: string;
  name: string;
};

type ProductValues = {
  id: string;
  name: string;
  brand_id: string;
  category_id: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  warranty_months: number;
  track_serial: boolean;
  is_active: boolean;
};

type ProductFormProps = {
  brands: Option[];
  categories: Option[];
  product?: ProductValues;
};

export function ProductForm({
  brands,
  categories,
  product,
}: ProductFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(product?.name ?? "");
  const [brandId, setBrandId] = useState(product?.brand_id ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.category_id ?? ""
  );
  const [sku, setSku] = useState(product?.sku ?? "");
  const [costPrice, setCostPrice] = useState(
    String(product?.cost_price ?? "")
  );
  const [sellingPrice, setSellingPrice] = useState(
    String(product?.selling_price ?? "")
  );
  const [warrantyMonths, setWarrantyMonths] = useState(
    String(product?.warranty_months ?? 0)
  );
  const [trackSerial, setTrackSerial] = useState(
    product?.track_serial ?? true
  );
  const [isActive, setIsActive] = useState(
    product?.is_active ?? true
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    const normalizedSku = sku.trim().toUpperCase();
    const cost = Number(costPrice);
    const price = Number(sellingPrice);
    const warranty = Number(warrantyMonths);

    if (!name.trim() || !brandId || !categoryId || !normalizedSku) {
      setError("Complete all required fields.");
      return;
    }

    if (cost < 0 || price < 0 || warranty < 0) {
      setError("Prices and warranty cannot be negative.");
      return;
    }

    setLoading(true);

    let skuQuery = supabase
      .from("products")
      .select("id")
      .eq("sku", normalizedSku)
      .limit(1);

    if (product) {
      skuQuery = skuQuery.neq("id", product.id);
    }

    let variantSkuQuery = supabase
      .from("product_variants")
      .select("id, product_id")
      .eq("sku", normalizedSku)
      .limit(1);

    if (product) {
      variantSkuQuery = variantSkuQuery.neq(
        "product_id",
        product.id
      );
    }

    const [
      { data: duplicateProduct },
      { data: duplicateVariant },
    ] = await Promise.all([
      skuQuery.maybeSingle(),
      variantSkuQuery.maybeSingle(),
    ]);

    if (duplicateProduct || duplicateVariant) {
      setLoading(false);
      setError("That SKU is already in use.");
      return;
    }

    const { error: saveError } = await supabase.rpc(
      "save_product_with_variant",
      {
        p_product_id: product?.id ?? null,
        p_name: name.trim(),
        p_brand_id: brandId,
        p_category_id: categoryId,
        p_sku: normalizedSku,
        p_cost_price: cost,
        p_selling_price: price,
        p_warranty_months: warranty,
        p_track_serial: trackSerial,
        p_is_active: isActive,
      }
    );

    setLoading(false);

    if (saveError) {
      setError(
        saveError.code === "23505"
          ? "That SKU is already in use."
          : saveError.message
      );
      return;
    }

    router.push(
      `/products?success=${product ? "updated" : "created"}`
    );
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl space-y-6 rounded-lg border p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Product Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>

        <Field label="SKU">
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2 font-mono"
          />
        </Field>

        <Field label="Brand">
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          >
            <option value="">Select brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category">
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cost">
          <input
            type="number"
            min="0"
            step="0.01"
            value={costPrice}
            onChange={(event) => setCostPrice(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>

        <Field label="Selling Price">
          <input
            type="number"
            min="0"
            step="0.01"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>

        <Field label="Warranty Period (months)">
          <input
            type="number"
            min="0"
            step="1"
            value={warrantyMonths}
            onChange={(event) => setWarrantyMonths(event.target.value)}
            required
            className="w-full rounded-md border bg-background p-2"
          />
        </Field>

        <Field label="Serial-number Tracking">
          <select
            value={trackSerial ? "yes" : "no"}
            onChange={(event) =>
              setTrackSerial(event.target.value === "yes")
            }
            className="w-full rounded-md border bg-background p-2"
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        Active
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : product
              ? "Update Product"
              : "Add Product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/products")}
          disabled={loading}
          className="rounded-md border px-4 py-2 font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
