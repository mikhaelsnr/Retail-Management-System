import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { PosClient } from "@/components/pos-client";

export default async function PosPage() {
  await requirePermission(["pos.use"]);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      id,
      branch:branches (
        id,
        name,
        code
      )
    `)
    .eq("id", user?.id)
    .single();

  const { data: customers } = await supabase
    .from("customers")
    .select(`
      id,
      customer_code,
      full_name,
      phone
    `)
    .eq("is_active", true)
    .order("full_name");

  const { data: inventory } = await supabase
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
    .gt("quantity", 0);

  const { data: serials } = await supabase
    .from("serial_numbers")
    .select(`
      id,
      product_id,
      serial_number,
      status
    `)
    .eq("branch_id", profile?.branch?.id)
    .eq("status", "available")
    .order("serial_number");

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
