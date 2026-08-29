import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";

type SalesBranch = {
  name: string;
  code: string;
};

type SalesCustomer = {
  customer_code: string | null;
  full_name: string;
};

type SalesCashier = {
  full_name: string;
};

export default async function SalesPage() {
  await requirePermission([
    "sales.view_all",
    "sales.view_branch",
  ]);

  const supabase = await createClient();

  const { data: sales, error } = await supabase
    .from("sales")
    .select(`
      id,
      sale_number,
      subtotal,
      discount_amount,
      total_amount,
      status,
      created_at,
      branch:branches (
        name,
        code
      ),
      customer:customers (
        customer_code,
        full_name
      ),
      cashier:profiles!sales_cashier_id_fkey (
        full_name
      )
    `)
    .order("created_at", { ascending: false })
    .overrideTypes<Array<{
      branch: SalesBranch | null;
      customer: SalesCustomer | null;
      cashier: SalesCashier | null;
    }>>();

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">
          Sales
        </h1>

        <p className="mt-4 text-red-500">
          Failed to load sales.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Sales
        </h1>

        <p className="text-sm text-muted-foreground">
          Completed POS transactions
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 text-left">
                Sale #
              </th>

              <th className="p-3 text-left">
                Date
              </th>

              <th className="p-3 text-left">
                Branch
              </th>

              <th className="p-3 text-left">
                Customer
              </th>

              <th className="p-3 text-left">
                Cashier
              </th>

              <th className="p-3 text-right">
                Subtotal
              </th>

              <th className="p-3 text-right">
                Discount
              </th>

              <th className="p-3 text-right">
                Total
              </th>

              <th className="p-3 text-left">
                Status
              </th>

              <th className="p-3 text-left">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {sales?.length ? (
              sales.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3 font-mono">
                    {sale.sale_number}
                  </td>

                  <td className="p-3">
                    {new Date(
                      sale.created_at
                    ).toLocaleString()}
                  </td>

                  <td className="p-3">
                    {sale.branch?.name ?? "-"}
                  </td>

                  <td className="p-3">
                    {sale.customer?.full_name ??
                      "Walk-in Customer"}
                  </td>

                  <td className="p-3">
                    {sale.cashier?.full_name ?? "-"}
                  </td>

                  <td className="p-3 text-right">
                    ₱
                    {Number(
                      sale.subtotal
                    ).toLocaleString()}
                  </td>

                  <td className="p-3 text-right">
                    -₱
                    {Number(
                      sale.discount_amount
                    ).toLocaleString()}
                  </td>

                  <td className="p-3 text-right font-medium">
                    ₱
                    {Number(
                      sale.total_amount
                    ).toLocaleString()}
                  </td>

                  <td className="p-3 capitalize">
                    {sale.status}
                  </td>

                  <td className="p-3">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={10}
                  className="p-6 text-center text-muted-foreground"
                >
                  No sales found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
