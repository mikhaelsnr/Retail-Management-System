import Link from "next/link";
import { ExcelImportClient } from "@/components/excel-import-client";
import { requirePermission } from "@/lib/require-permission";

export default async function ProductImportPage() {
  await requirePermission([
    "inventory.manage_all",
    "inventory.manage_branch",
  ]);

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link href="/products" className="text-sm underline">
          &larr; Back to Products
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Import Products &amp; Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Validate an Excel workbook, review the preview, and import inventory in bulk.
        </p>
      </div>

      <ExcelImportClient />
    </main>
  );
}
