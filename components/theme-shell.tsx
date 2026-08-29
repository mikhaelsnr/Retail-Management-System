"use client";

import { usePathname } from "next/navigation";

export type AppearancePreferences = {
  theme: "plain_dark" | "plain_light" | "modern_dark" | "studio_dark" | "light_retail" | "hybrid" | "blue_accent";
  density: "comfortable" | "compact";
  sidebar_default: "expanded" | "collapsed";
};

export function ThemeShell({
  preferences,
  sidebar,
  children,
}: {
  preferences: AppearancePreferences;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const theme = preferences.theme === "hybrid"
    ? pathname.startsWith("/pos") ? "hybrid_dark" : "hybrid_light"
    : preferences.theme;

  return (
    <div
      className="tz-shell flex min-h-screen"
      data-theme={theme}
      data-density={preferences.density}
    >
      {sidebar}
      <div className="tz-main min-w-0 flex-1">{children}</div>
    </div>
  );
}
