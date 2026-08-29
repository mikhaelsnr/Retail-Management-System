import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/require-permission";
import { createClient } from "@/lib/supabase/server";
import { BranchForm } from "@/components/branch-form";

type EditBranchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditBranchPage({
  params,
}: EditBranchPageProps) {
  await requirePermission(["branches.manage"]);

  const { id } = await params;
  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("branches")
    .select("id, code, name, address, phone, email, is_active")
    .eq("id", id)
    .single();

  if (error || !branch) {
    notFound();
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link href="/branches" className="text-sm underline">
          Back to Branches
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Edit Branch</h1>
        <p className="text-sm text-muted-foreground">
          Update location details or active status
        </p>
      </div>
      <BranchForm branch={branch} />
    </main>
  );
}
