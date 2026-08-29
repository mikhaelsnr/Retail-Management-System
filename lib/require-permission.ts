import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePermission(
  requiredPermissions: string[]
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Confirm user is active
  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select(`
        id,
        is_active
      `)
      .eq("id", user.id)
      .single();

  if (
    profileError ||
    !profile ||
    !profile.is_active
  ) {
    redirect("/auth/login");
  }

  // Check permissions using the database security function
  let allowed = false;

  for (const permission of requiredPermissions) {
    const { data, error } = await supabase.rpc(
      "has_permission",
      {
        p_permission: permission,
      }
    );

    if (!error && data === true) {
      allowed = true;
      break;
    }
  }

  if (!allowed) {
    redirect("/unauthorized");
  }

  return {
    user,
    profile,
  };
}