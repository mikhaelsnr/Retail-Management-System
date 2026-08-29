import Link from "next/link";
import { requirePermission } from "@/lib/require-permission";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";

type BranchesPageProps = {
  searchParams: Promise<{ success?: string }>;
};

export default async function BranchesPage({
  searchParams,
}: BranchesPageProps) {
  await requirePermission(["branches.view_all"]);

  const supabase = await createClient();
  const params = await searchParams;
  const [{ data: branches, error }, { data: canManageBranches }] =
    await Promise.all([
      supabase
        .from("branches")
        .select(`
          id,
          code,
          name,
          address,
          phone,
          email,
          is_active,
          created_at
        `)
        .order("name"),
      supabase.rpc("has_permission", {
        p_permission: "branches.manage",
      }),
    ]);

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Store locations and operating status
          </p>
        </div>

        {canManageBranches === true && (
          <Link
            href="/branches/new"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Add Branch
          </Link>
        )}
      </div>

      {params.success && (
        <p className="mb-4 rounded-md border border-green-500/50 p-3 text-sm text-green-500">
          {params.success === "updated"
            ? "Branch updated successfully."
            : "Branch created successfully."}
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-500">Failed to load branches.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Address</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-left">Created</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches?.map((branch) => (
                <tr key={branch.id} className="border-b last:border-b-0">
                  <td className="p-3 font-mono">{branch.code}</td>
                  <td className="p-3 font-medium">{branch.name}</td>
                  <td className="p-3">{branch.address ?? "-"}</td>
                  <td className="p-3">{branch.phone ?? "-"}</td>
                  <td className="p-3">{branch.email ?? "-"}</td>
                  <td className="p-3 text-center">
                    <StatusBadge status={branch.is_active ? "Active" : "Inactive"} />
                  </td>
                  <td className="p-3">
                    {new Date(branch.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {canManageBranches === true ? (
                      <Link
                        href={`/branches/${branch.id}/edit`}
                        className="underline"
                      >
                        Edit
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {!branches?.length && (
                <tr>
                  <td
                    colSpan={8}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No branches found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
