import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { PrintReceiptButton } from "@/components/print-receipt-button";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

type ReceiptBranch = {
  name: string;
  address: string | null;
  phone: string | null;
};

type ReceiptCustomer = {
  customer_code: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type ReceiptCashier = {
  full_name: string;
};

type ReceiptProduct = {
  sku: string;
  name: string;
};

type ReceiptSerial = {
  serial_number: string;
};

export default async function ReceiptPage({
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
      created_at,
      branch:branches (
        name,
        address,
        phone
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
    .single()
    .overrideTypes<{
      branch: ReceiptBranch | null;
      customer: ReceiptCustomer | null;
      cashier: ReceiptCashier | null;
    }>();

  if (error || !sale) {
    notFound();
  }

  const { data: items } = await supabase
    .from("sale_items")
    .select(`
      id,
      quantity,
      unit_price,
      line_total,
      product:products (
        sku,
        name
      ),
      serial:serial_numbers (
        serial_number
      )
    `)
    .eq("sale_id", id)
    .overrideTypes<Array<{
      product: ReceiptProduct | null;
      serial: ReceiptSerial | null;
    }>>();

  const { data: payments } = await supabase
    .from("payments")
    .select(`
      id,
      payment_method,
      amount,
      tendered_amount,
      change_amount,
      reference_number
    `)
    .eq("sale_id", id)
    .order("created_at");

  return (
    <main className="min-h-screen bg-white p-4 text-black print:p-0">
      <div className="mx-auto max-w-md">

        <div className="mb-4 flex justify-end print:hidden">
          <PrintReceiptButton />
        </div>

        <section
          id="receipt"
          className="border border-black p-4 print:border-0"
        >
          <div className="text-center">
            <h1 className="text-xl font-bold">
              TechZone POS
            </h1>

            <p className="text-sm">
              {sale.branch?.name ?? ""}
            </p>

            {sale.branch?.address && (
              <p className="text-xs">
                {sale.branch.address}
              </p>
            )}

            {sale.branch?.phone && (
              <p className="text-xs">
                {sale.branch.phone}
              </p>
            )}
          </div>

          <div className="my-4 border-t border-dashed border-black" />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Receipt:</span>
              <span>{sale.sale_number}</span>
            </div>

            <div className="flex justify-between">
              <span>Date:</span>
              <span>
                {new Date(
                  sale.created_at
                ).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>
                {sale.cashier?.full_name ?? "-"}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Customer:</span>
              <span>
                {sale.customer?.full_name ??
                  "Walk-in Customer"}
              </span>
            </div>
          </div>

          <div className="my-4 border-t border-dashed border-black" />

          <div className="space-y-4">
            {items?.map((item) => (
              <div key={item.id}>
                <div className="font-medium">
                  {item.product?.name}
                </div>

                <div className="text-xs">
                  SKU: {item.product?.sku}
                </div>

                {item.serial?.serial_number && (
                  <div className="text-xs">
                    SN: {item.serial.serial_number}
                  </div>
                )}

                <div className="mt-1 flex justify-between text-sm">
                  <span>
                    {item.quantity} × ₱
                    {Number(
                      item.unit_price
                    ).toLocaleString()}
                  </span>

                  <span>
                    ₱
                    {Number(
                      item.line_total
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-dashed border-black" />

          <div className="space-y-2 text-sm">
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

            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>
                ₱
                {Number(
                  sale.total_amount
                ).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="my-4 border-t border-dashed border-black" />

          {payments?.map((payment) => (
            <div
              key={payment.id}
              className="space-y-1 text-sm"
            >
              <div className="flex justify-between">
                <span>Payment</span>

                <span className="capitalize">
                  {payment.payment_method.replaceAll(
                    "_",
                    " "
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Amount</span>

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
                    <span>Cash</span>

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

          <div className="my-4 border-t border-dashed border-black" />

          <div className="text-center text-xs">
            <p>Thank you for your purchase.</p>
            <p>Please keep this receipt for warranty purposes.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
