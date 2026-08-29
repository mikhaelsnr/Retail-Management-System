import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SaleDetailPage({
  params,
}: Props) {
  await requirePermission([
    "sales.view_all",
    "sales.view_branch",
  ]);

  const { id } = await params;

  const supabase = await createClient();

  const { data: sale, error } = await supabase
    .from("sales")
    .select(`
      id,
      sale_number,
      subtotal,
      discount_amount,
      total_amount,
      status,
      notes,
      created_at,
      branch:branches (
        name,
        code
      ),
      customer:customers (
        customer_code,
        full_name,
        phone,
        email
      ),
      cashier:profiles!sales_cashier_id_fkey (
        full_name
      )
    `)
    .eq("id", id)
    .single();

  if (error || !sale) {
    notFound();
  }

  const { data: items } = await supabase
    .from("sale_items")
    .select(`
      id,
      quantity,
      unit_price,
      discount_amount,
      line_total,
      product:products (
        sku,
        name
      ),
      serial:serial_numbers (
        serial_number
      )
    `)
    .eq("sale_id", id);

  const { data: payments } = await supabase
    .from("payments")
    .select(`
      id,
      payment_method,
      amount,
      tendered_amount,
      change_amount,
      reference_number,
      created_at
    `)
    .eq("sale_id", id)
    .order("created_at");

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/sales"
            className="text-sm underline"
          >
            ← Back to Sales
          </Link>

          <h1 className="mt-3 text-2xl font-bold">
            {sale.sale_number}
          </h1>

          <p className="text-sm text-muted-foreground">
            {new Date(
              sale.created_at
            ).toLocaleString()}
          </p>
        </div>

        <Link
          href={`/sales/${sale.id}/receipt`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Print Receipt
        </Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Branch
          </p>
          <p className="mt-1 font-medium">
            {sale.branch?.name ?? "-"}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Customer
          </p>
          <p className="mt-1 font-medium">
            {sale.customer?.full_name ??
              "Walk-in Customer"}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Cashier
          </p>
          <p className="mt-1 font-medium">
            {sale.cashier?.full_name ?? "-"}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Status
          </p>
          <p className="mt-1 font-medium capitalize">
            {sale.status}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">
          Items
        </h2>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left">
                  SKU
                </th>
                <th className="p-3 text-left">
                  Product
                </th>
                <th className="p-3 text-left">
                  Serial
                </th>
                <th className="p-3 text-right">
                  Qty
                </th>
                <th className="p-3 text-right">
                  Unit Price
                </th>
                <th className="p-3 text-right">
                  Line Total
                </th>
              </tr>
            </thead>

            <tbody>
              {items?.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3 font-mono">
                    {item.product?.sku ?? "-"}
                  </td>

                  <td className="p-3">
                    {item.product?.name ?? "-"}
                  </td>

                  <td className="p-3 font-mono">
                    {item.serial?.serial_number ?? "-"}
                  </td>

                  <td className="p-3 text-right">
                    {item.quantity}
                  </td>

                  <td className="p-3 text-right">
                    ₱
                    {Number(
                      item.unit_price
                    ).toLocaleString()}
                  </td>

                  <td className="p-3 text-right">
                    ₱
                    {Number(
                      item.line_total
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-5">
          <h2 className="mb-4 text-lg font-semibold">
            Payment
          </h2>

          {payments?.map((payment) => (
            <div
              key={payment.id}
              className="space-y-2"
            >
              <div className="flex justify-between">
                <span>Method</span>
                <span className="capitalize">
                  {payment.payment_method.replaceAll(
                    "_",
                    " "
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Amount Applied</span>
                <span>
                  ₱
                  {Number(
                    payment.amount
                  ).toLocaleString()}
                </span>
              </div>

              {payment.payment_method === "cash" && (
                <>
                  <div className="flex justify-between">
                    <span>Cash Tendered</span>
                    <span>
                      ₱
                      {Number(
                        payment.tendered_amount ?? 0
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Change</span>
                    <span>
                      ₱
                      {Number(
                        payment.change_amount ?? 0
                      ).toLocaleString()}
                    </span>
                  </div>
                </>
              )}

              {payment.reference_number && (
                <div className="flex justify-between">
                  <span>Reference</span>
                  <span>
                    {payment.reference_number}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-lg border p-5">
          <h2 className="mb-4 text-lg font-semibold">
            Summary
          </h2>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>
                ₱
                {Number(
                  sale.subtotal
                ).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Discount</span>
              <span>
                -₱
                {Number(
                  sale.discount_amount
                ).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <span>Total</span>
              <span>
                ₱
                {Number(
                  sale.total_amount
                ).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
