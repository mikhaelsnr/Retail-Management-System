import { AddCustomerForm } from "@/components/add-customer-form";
import { requirePermission } from "@/lib/require-permission";

export default async function NewCustomerPage() {
  await requirePermission(["customers.manage"]);

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Add Customer
        </h1>

        <p className="text-sm text-muted-foreground">
          Create a new customer record
        </p>
      </div>

      <AddCustomerForm />
    </main>
  );
}
