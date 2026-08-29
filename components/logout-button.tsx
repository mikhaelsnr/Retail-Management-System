"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

type LogoutButtonProps = {
  collapsed?: boolean;
  showIcon?: boolean;
};

export function LogoutButton({ collapsed = false, showIcon = true }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const logout = async () => {
    setIsLoading(true);
    setFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      window.location.replace("/auth/login");
    } catch {
      setFailed(true);
      setIsLoading(false);
    } finally {
      window.clearTimeout(timeout);
    }
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
      {!collapsed && (
        <span>
          {isLoading ? "Logging out..." : failed ? "Retry logout" : "Logout"}
        </span>
      )}
    </button>
  );
}
