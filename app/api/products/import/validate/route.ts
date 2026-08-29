import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

const normalize = (value: string) =>
  value.toLowerCase().replace(/*/g, "").replace(/s+/g, " ").trim();
const text = (value: unknown) => String(value ?? "").trim();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    return Response.json({ error: "Select a valid .xlsx file." }, { status: 400 });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
    const sheet = workbook.getWorksheet("Product_Inventory_Import") ?? workbook.worksheets[0];
    if (!sheet) throw new Error("The workbook contains no import sheet.");

    const headerMap = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => headerMap.set(normalize(cell.text), column));
    const required = ["sku", "product name", "cost price", "selling price", "track serial?", "branch code", "opening quantity"];
    const missing = required.filter((header) => !headerMap.has(header));
    if (missing.length) throw new Error("Missing required columns: " + missing.join(", "));
    const get = (row: ExcelJS.Row, header: string) => {
      const column = headerMap.get(header);
      return column ? row.getCell(column).value : null;
    };

    const rawRows: Array<Record<string, unknown>> = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const sku = text(get(row, "sku"));
      if (!sku && row.values.slice(1).every((value) => text(value) === "")) return;
      rawRows.push({
        row_number: rowNumber,
        sku: sku.toUpperCase(),
        product_name: text(get(row, "product name")),
        brand: text(get(row, "brand")),
        category: text(get(row, "category")),
        description: text(get(row, "description")),
        cost_price: text(get(row, "cost price")),
        selling_price: text(get(row, "selling price")),
        barcode: text(get(row, "barcode")),
        warranty_months: text(get(row, "warranty months")),
        track_serial_text: text(get(row, "track serial?")),
        branch_code: text(get(row, "branch code")).toUpperCase(),
        opening_quantity: text(get(row, "opening quantity")),
        reorder_level: text(get(row, "reorder level")),
        serial_text: text(get(row, "serial numbers")),
      });
    });
    if (!rawRows.length) throw new Error("The import sheet has no data rows.");

    const [
      { data: branches },
      { data: products },
      { data: canManageAll },
      { data: canManageBranch },
      { data: canManageProducts },
      { data: profile },
    ] = await Promise.all([
      supabase.from("branches").select("id, code, name").eq("is_active", true),
      supabase.from("products").select("id, sku, name, cost_price, selling_price, barcode, warranty_months, track_serial"),
      supabase.rpc("has_permission", { p_permission: "inventory.manage_all" }),
      supabase.rpc("has_permission", { p_permission: "inventory.manage_branch" }),
      supabase.rpc("has_permission", { p_permission: "products.manage" }),
      supabase.from("profiles").select("branch_id").eq("id", user.id).single(),
    ]);

    const allSerials = rawRows.flatMap((row) =>
      text(row.serial_text).split(";").map((serial) => serial.trim()).filter(Boolean)
    );
    const { data: existingSerials } = allSerials.length
      ? await supabase.from("serial_numbers").select("serial_number").in("serial_number", allSerials)
      : { data: [] };
    const existingSerialSet = new Set(existingSerials?.map((item) => item.serial_number) ?? []);
    const fileSerialCounts = new Map<string, number>();
    allSerials.forEach((serial) => fileSerialCounts.set(serial, (fileSerialCounts.get(serial) ?? 0) + 1));
    const skuCounts = new Map<string, number>();
    rawRows.forEach((row) => skuCounts.set(text(row.sku), (skuCounts.get(text(row.sku)) ?? 0) + 1));

    const rows = rawRows.map((raw) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const number = (field: string, requiredField = false) => {
        const source = text(raw[field]);
        if (!source && !requiredField) return null;
        const value = Number(source);
        if (!source || !Number.isFinite(value) || value < 0) errors.push(field.replaceAll("_", " ") + " must be a number >= 0.");
        return value;
      };
      const integer = (field: string, requiredField = false) => {
        const value = number(field, requiredField);
        if (value !== null && !Number.isInteger(value)) errors.push(field.replaceAll("_", " ") + " must be an integer.");
        return value;
      };
      if (!raw.sku) errors.push("SKU is required.");
      if (!raw.product_name) errors.push("Product Name is required.");
      const cost = number("cost_price", true);
      const price = number("selling_price", true);
      const quantity = integer("opening_quantity", true);
      const reorder = integer("reorder_level");
      const warranty = integer("warranty_months");
      const yesNo = text(raw.track_serial_text).toLowerCase();
      if (!["yes", "no"].includes(yesNo)) errors.push("Track Serial must be Yes or No.");
      const trackSerial = yesNo === "yes";
      const serialNumbers = text(raw.serial_text).split(";").map((serial) => serial.trim()).filter(Boolean);
      if (trackSerial && (quantity ?? 0) > 0 && !serialNumbers.length) errors.push("Serial Numbers are required.");
      if (trackSerial && quantity !== null && serialNumbers.length !== quantity) errors.push("Serial count must equal Opening Quantity.");
      if (!trackSerial && serialNumbers.length) errors.push("Serial Numbers must be empty when Track Serial is No.");
      serialNumbers.forEach((serial) => {
        if ((fileSerialCounts.get(serial) ?? 0) > 1) errors.push("Duplicate serial in workbook: " + serial);
        if (existingSerialSet.has(serial)) errors.push("Serial already exists: " + serial);
      });

      const branch = branches?.find((item) => item.code.toUpperCase() === raw.branch_code);
      if (!branch) errors.push("Branch Code does not match an active branch.");
      if (branch && canManageAll !== true && (!canManageBranch || profile?.branch_id !== branch.id)) {
        errors.push("You cannot import for this branch.");
      }
      const product = products?.find((item) => item.sku.toUpperCase() === raw.sku);
      if (!product && canManageProducts !== true) errors.push("products.manage is required to create this product.");
      if (raw.barcode && products?.some((item) => item.barcode === raw.barcode && item.id !== product?.id)) errors.push("Barcode already belongs to another product.");
      if (product) {
        const differences = [
          product.name !== raw.product_name && "name",
          Number(product.cost_price) !== cost && "cost",
          Number(product.selling_price) !== price && "selling price",
          product.barcode !== (raw.barcode || null) && "barcode",
          product.warranty_months !== (warranty ?? 0) && "warranty",
          product.track_serial !== trackSerial && "serial tracking",
        ].filter(Boolean);
        if (differences.length) warnings.push("Existing product differs: " + differences.join(", ") + ". Existing values will remain.");
      }
      if ((skuCounts.get(text(raw.sku)) ?? 0) > 1) warnings.push("SKU appears on multiple rows; product will be matched safely.");

      return {
        ...raw,
        cost_price: cost, selling_price: price, warranty_months: warranty ?? 0,
        track_serial: trackSerial, opening_quantity: quantity, reorder_level: reorder,
        serial_numbers: serialNumbers, branch_name: branch?.name ?? raw.branch_code,
        product_id: product?.id ?? null,
        action: errors.length ? "Error" : product ? "Existing Product + Receive Stock" : "Create Product + Receive Stock",
        status: errors.length ? "Error" : warnings.length ? "Warning" : "Ready",
        errors, warnings,
      };
    });

    return Response.json({
      rows,
      summary: {
        total: rows.length,
        ready: rows.filter((row) => row.status === "Ready").length,
        warnings: rows.filter((row) => row.status === "Warning").length,
        errors: rows.filter((row) => row.status === "Error").length,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to parse workbook." }, { status: 400 });
  }
}
