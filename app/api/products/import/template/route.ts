import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

const headers = [
  "SKU*", "Product Name*", "Brand", "Category", "Description",
  "Cost Price*", "Selling Price*", "Barcode", "Warranty Months",
  "Track Serial?*", "Branch Code*", "Opening Quantity*",
  "Reorder Level", "Serial Numbers",
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: branches } = await supabase
    .from("branches").select("code, name").eq("is_active", true).order("name");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Product_Inventory_Import");
  sheet.addRow(headers);
  sheet.addRow(["LAPTOP-001", "Sample Laptop", "Sample Brand", "Laptops", "", 25000, 29999, "", 12, "Yes", branches?.[0]?.code ?? "CDO", 1, 5, "SAMPLE-SERIAL-001"]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => { column.width = 20; });
  sheet.getColumn(5).width = 30;
  sheet.getColumn(14).width = 36;

  const reference = workbook.addWorksheet("Branch_Reference");
  reference.addRow(["Branch Code", "Branch Name"]);
  branches?.forEach((branch) => reference.addRow([branch.code, branch.name]));
  reference.getRow(1).font = { bold: true };
  reference.columns = [{ width: 18 }, { width: 30 }];

  const guide = workbook.addWorksheet("Field_Guide");
  guide.addRows([
    ["Field", "Guidance"],
    ["Track Serial?*", "Use Yes or No."],
    ["Serial Numbers", "Separate serial numbers with semicolons (;). Count must equal Opening Quantity."],
    ["Opening Quantity*", "Adds to existing branch inventory; it never replaces stock."],
    ["Reorder Level", "Used for new inventory only. Leave blank for the global default."],
    ["Existing SKU", "Existing product attributes remain unchanged; only inventory is received."],
  ]);
  guide.getRow(1).font = { bold: true };
  guide.columns = [{ width: 24 }, { width: 80 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=TechZone_POS_Product_Inventory_Import_Template.xlsx",
    },
  });
}
