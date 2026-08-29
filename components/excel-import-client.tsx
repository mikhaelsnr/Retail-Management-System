"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ImportRow = {
  row_number: number;
  sku: string;
  product_name: string;
  brand: string;
  category: string;
  description: string;
  cost_price: number | null;
  selling_price: number | null;
  barcode: string;
  warranty_months: number;
  track_serial: boolean;
  branch_code: string;
  branch_name: string;
  opening_quantity: number | null;
  reorder_level: number | null;
  serial_numbers: string[];
  action: string;
  status: "Ready" | "Warning" | "Error";
  errors: string[];
  warnings: string[];
};

type ValidationSummary = {
  total: number;
  ready: number;
  warnings: number;
  errors: number;
};

type ValidationResult = {
  rows: ImportRow[];
  summary: ValidationSummary;
};

type ImportSummary = {
  products_created: number;
  existing_products_used: number;
  inventory_records_created: number;
  total_units_received: number;
  serial_numbers_created: number;
  rows_skipped: number;
};

const summaryCards: Array<{
  key: keyof ValidationSummary;
  label: string;
  className: string;
}> = [
  { key: "total", label: "Total Rows", className: "" },
  { key: "ready", label: "Ready", className: "text-green-500" },
  { key: "warnings", label: "Warnings", className: "text-amber-500" },
  { key: "errors", label: "Errors", className: "text-red-500" },
];

export function ExcelImportClient() {
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);

  async function validateFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setValidation(null);
    setImportSummary(null);

    if (!file || !file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Select a valid .xlsx file.");
      return;
    }

    setValidating(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/products/import/validate", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to validate the workbook.");
      }
      setValidation(result as ValidationResult);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Unable to validate the workbook."
      );
    } finally {
      setValidating(false);
    }
  }

  async function confirmImport() {
    if (!validation || validation.summary.errors > 0) return;

    setError("");
    setImportSummary(null);
    setImporting(true);

    const rows = validation.rows.map((row) => ({
      sku: row.sku,
      product_name: row.product_name,
      brand: row.brand,
      category: row.category,
      description: row.description,
      cost_price: row.cost_price,
      selling_price: row.selling_price,
      barcode: row.barcode,
      warranty_months: row.warranty_months,
      track_serial: row.track_serial,
      branch_code: row.branch_code,
      opening_quantity: row.opening_quantity,
      reorder_level: row.reorder_level,
      serial_numbers: row.serial_numbers,
    }));

    const { data, error: importError } = await supabase.rpc(
      "bulk_import_products_inventory",
      { p_rows: rows }
    );

    setImporting(false);
    if (importError) {
      setError(importError.message);
      return;
    }

    setImportSummary(data as ImportSummary);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={validateFile} className="rounded-lg border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="excel-file" className="mb-2 block text-sm font-medium">
              Excel workbook
            </label>
            <input
              id="excel-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setValidation(null);
                setImportSummary(null);
                setError("");
              }}
              className="block w-full rounded-md border bg-background p-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium"
            />
          </div>
          <Button type="submit" disabled={!file || validating || importing}>
            {validating ? "Validating..." : "Validate File"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/api/products/import/template">Download Template</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the template and upload an .xlsx workbook. Review every row before confirming.
        </p>
      </form>

      {error && (
        <p className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {validation && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${card.className}`}>
                    {validation.summary[card.key]}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="border-b">
                <tr>
                  <th className="p-3 text-left">Row #</th>
                  <th className="p-3 text-left">SKU</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Branch</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Serial count</th>
                  <th className="p-3 text-right">Reorder Level</th>
                  <th className="p-3 text-left">Action</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.map((row) => (
                  <tr key={row.row_number} className="border-b align-top last:border-b-0">
                    <td className="p-3">{row.row_number}</td>
                    <td className="p-3 font-mono">{row.sku || "-"}</td>
                    <td className="p-3 font-medium">{row.product_name || "-"}</td>
                    <td className="p-3">{row.branch_name || "-"}</td>
                    <td className="p-3 text-right">{row.opening_quantity ?? "-"}</td>
                    <td className="p-3 text-right">{row.serial_numbers.length}</td>
                    <td className="p-3 text-right">{row.reorder_level ?? "Default"}</td>
                    <td className="p-3">{row.action}</td>
                    <td className="p-3">
                      <Badge
                        variant={row.status === "Error" ? "destructive" : "outline"}
                        className={
                          row.status === "Warning"
                            ? "border-amber-500/50 text-amber-500"
                            : row.status === "Ready"
                              ? "border-green-500/50 text-green-500"
                              : undefined
                        }
                      >
                        {row.status}
                      </Badge>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <ul className="mt-2 max-w-sm space-y-1 text-xs">
                          {row.errors.map((message) => (
                            <li key={`error-${message}`} className="text-red-500">
                              {message}
                            </li>
                          ))}
                          {row.warnings.map((message) => (
                            <li key={`warning-${message}`} className="text-amber-500">
                              {message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={confirmImport}
              disabled={validation.summary.errors > 0 || importing || Boolean(importSummary)}
            >
              {importing ? "Importing..." : "Confirm Import"}
            </Button>
            {validation.summary.errors > 0 && (
              <p className="text-sm text-red-500">
                Fix all validation errors before importing.
              </p>
            )}
          </div>
        </>
      )}

      {importSummary && (
        <Card className="border-green-500/50">
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-sm text-muted-foreground">Products created</dt><dd className="text-xl font-bold">{importSummary.products_created}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Existing products used</dt><dd className="text-xl font-bold">{importSummary.existing_products_used}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Inventory records created</dt><dd className="text-xl font-bold">{importSummary.inventory_records_created}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Units received</dt><dd className="text-xl font-bold">{importSummary.total_units_received}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Serial numbers created</dt><dd className="text-xl font-bold">{importSummary.serial_numbers_created}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Rows skipped</dt><dd className="text-xl font-bold">{importSummary.rows_skipped}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
