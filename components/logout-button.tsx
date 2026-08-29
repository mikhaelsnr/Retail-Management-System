"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

type LogoutButtonProps = {
  collapsed?: boolean;
  showIcon?: boolean;
};

export function LogoutButton({ collapsed = false, showIcon = true }: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const logout = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setIsLoading(false);
      return;
    }

    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isLoading}
      title={collapsed ? "Logout" : undefined}
      className={
        "tz-nav-item flex w-full items-center rounded-md px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60 " +
        (collapsed ? "justify-center" : "gap-3")
      }
    >
      {showIcon && <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />}
      {!collapsed && <span>{isLoading ? "Logging out..." : "Logout"}</span>}
    </button>
  );
}
