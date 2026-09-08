import { Pagination } from "@/components/pagination";
import { getPage, PAGE_SIZE, type PageSearchParams } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { UserAssignmentForm } from "@/components/user-assignment-form";

export default async function UsersPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const page = getPage(params);
  await requirePermission(["users.view"]);

  const supabase = await createClient();

  const [usersResult, rolesResult, branchesResult] = await Promise.all([
    supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      is_active,
      role_id,
      branch_id,
      role:roles (
        id,
        name
      ),
      branch:branches (
        id,
        name
      )
    `)
    .order("full_name")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    supabase
    .from("roles")
    .select("id, name")
    .order("name"),
    supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name"),
  ]);
  if (usersResult.error || rolesResult.error || branchesResult.error) {
    return <main className="p-6"><h1 className="text-2xl font-bold">Users</h1><p className="mt-4 text-red-500">Failed to load users or assignment options.</p></main>;
  }
  const { data: usersRows } = usersResult;
  const users = usersRows?.slice(0, PAGE_SIZE);
  const { data: roles } = rolesResult;
  const { data: branches } = branchesResult;

  const normalizedUsers = users?.map((user) => ({
    ...user,
    role: Array.isArray(user.role)
      ? (user.role[0] ?? null)
      : user.role,
    branch: Array.isArray(user.branch)
      ? (user.branch[0] ?? null)
      : user.branch,
  }));

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Assign role, branch, and active status
        </p>
      </div>

      <div className="space-y-4">
        {normalizedUsers?.map((user) => (
          <UserAssignmentForm
            key={user.id}
            user={user}
            roles={roles ?? []}
            branches={branches ?? []}
          />
        ))}
      </div>
      <Pagination path="/users" params={params} page={page} hasNext={(usersRows?.length ?? 0) > PAGE_SIZE} />
    </main>
  );
}
