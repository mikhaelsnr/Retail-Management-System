import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/get-user-context";

export async function requirePermission(requiredPermissions: string[]) {
  const context = await getCurrentUserContext();
  // Preserve the existing ANY permission semantics. Database RLS remains authoritative.
  if (!requiredPermissions.some((permission) => context.permissions.includes(permission))) {
    redirect("/unauthorized");
  }
  return context;
}
