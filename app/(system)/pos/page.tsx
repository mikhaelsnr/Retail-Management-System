import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { PosClient } from "@/components/pos-client";

type PosProduct = {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  track_serial: boolean;
};

export default async function PosPage() {
  const { profile } = await requirePermission(["pos.use"]);

  const supabase = await createClient();

  const [customersResult, inventoryResult, serialsResult] = await Promise.all([
    supabase
    .from("customers")
    .select(`
      id,
      customer_code,
      full_name,
      phone
    `)
    .eq("is_active", true)
    .order("full_name"),
    supabase
    .from("inventory")
    .select(`
      id,
      quantity,
      product:products (
        id,
        sku,
        name,
        selling_price,
        track_serial
      )
    `)
    .eq("branch_id", profile?.branch?.id)
    .gt("quantity", 0)
    .overrideTypes<Array<{
      product: PosProduct | null;
    }>>(),
    supabase
    .from("serial_numbers")
    .select(`
      id,
      product_id,
      serial_number,
      status
    `)
    .eq("branch_id", profile?.branch?.id)
    .eq("status", "available")
    .order("serial_number"),
  ]);
  if (customersResult.error || inventoryResult.error || serialsResult.error) {
    return <main className="p-6"><p className="text-red-500">Failed to load POS data. Please try again.</p></main>;
  }
  const { data: customers } = customersResult;
  const { data: inventory } = inventoryResult;
  const { data: serials } = serialsResult;

  return (
    <main className="tz-pos p-6">
      <PosClient
        branch={profile?.branch ?? null}
        customers={customers ?? []}
        inventory={inventory ?? []}
        serials={serials ?? []}
      />
    </main>
  );
}
