"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = {
  id: string;
  name: string;
};

type Branch = {
  id: string;
  name: string;
};

type User = {
  id: string;
  full_name: string | null;
  is_active: boolean;
  role_id: string | null;
  branch_id: string | null;
  role: Role | null;
  branch: Branch | null;
};

type Props = {
  user: User;
  roles: Role[];
  branches: Branch[];
};

export function UserAssignmentForm({
  user,
  roles,
  branches,
}: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [roleId, setRoleId] = useState(
    user.role_id ?? ""
  );
  const [branchId, setBranchId] = useState(
    user.branch_id ?? ""
  );
  const [isActive, setIsActive] = useState(
    user.is_active
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setMessage("");

    if (!roleId) {
      setError("Select a role.");
      return;
    }

    setLoading(true);

    const { error: rpcError } = await supabase.rpc(
      "update_user_assignment",
      {
        p_user_id: user.id,
        p_role_id: roleId,
        p_branch_id: branchId || null,
        p_is_active: isActive,
      }
    );

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage("User updated.");
    router.refresh();
  }

  return (
    <div className="rounded-lg border p-5">
      <div className="mb-4">
        <div className="font-medium">
          {user.full_name ?? "Unnamed User"}
        </div>

        <div className="text-sm text-muted-foreground">
          Current: {user.role?.name ?? "No role"} /{" "}
          {user.branch?.name ?? "No branch"}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <select
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          className="rounded-md border bg-background p-2"
        >
          <option value="">Select role</option>

          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>

        <select
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          className="rounded-md border bg-background p-2"
        >
          <option value="">No branch</option>

          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) =>
              setIsActive(event.target.checked)
            }
          />
          Active
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={loading}
          className="rounded-md bg-white px-4 py-2 text-black disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save"}
        </button>

        {message && (
          <span className="text-sm text-green-500">
            {message}
          </span>
        )}

        {error && (
          <span className="text-sm text-red-500">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
