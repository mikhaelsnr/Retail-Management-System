import Link from "next/link";
import { requirePermission } from "@/lib/require-permission";
import { BranchForm } from "@/components/branch-form";

export default async function NewBranchPage() {
  await requirePermission(["branches.manage"]);

  return (
    <main className="p-6">
      <div className="mb-6">
        <Link href="/branches" className="text-sm underline">
          Back to Branches
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Add Branch</h1>
        <p className="text-sm text-muted-foreground">
          Create a new TechZone store location
        </p>
      </div>
      <BranchForm />
    </main>
  );
}
