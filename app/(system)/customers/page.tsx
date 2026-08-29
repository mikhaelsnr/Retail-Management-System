import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { StatusBadge } from "@/components/status-badge";

export default async function CustomersPage() {
  await requirePermission([
    "customers.view",
    "customers.manage",
  ]);

  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select(`
      id,
      customer_code,
      full_name,
      phone,
      email,
      customer_type,
      is_active,
      created_at
    `)
    .order("full_name");

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="mt-4 text-red-500">
          Failed to load customers.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Customers
          </h1>

          <p className="text-sm text-muted-foreground">
            Customer records
          </p>
        </div>

        <Link
          href="/customers/new"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Add Customer
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 text-left">Code</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Phone</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>

          <tbody>
            {customers?.length ? (
              customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3 font-mono">
                    {customer.customer_code ?? "-"}
                  </td>

                  <td className="p-3 font-medium">
                    {customer.full_name}
                  </td>

                  <td className="p-3">
                    {customer.phone ?? "-"}
                  </td>

                  <td className="p-3">
                    {customer.email ?? "-"}
                  </td>

                  <td className="p-3 capitalize">
                    {customer.customer_type}
                  </td>

                  <td className="p-3">
                    <StatusBadge status={customer.is_active ? "Active" : "Inactive"} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-muted-foreground"
                >
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
