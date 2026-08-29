import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { UserAssignmentForm } from "@/components/user-assignment-form";

export default async function UsersPage() {
  await requirePermission(["users.view"]);

  const supabase = await createClient();

  const { data: users } = await supabase
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
    .order("full_name");

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .order("name");

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

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
    </main>
  );
}
