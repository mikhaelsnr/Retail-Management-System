"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type DashboardBranch = {
  id: string;
  code: string;
  name: string;
};

type DashboardPeriod = "today" | "7d" | "30d";

export function DashboardFilters({
  branches,
  selectedBranchId,
  period,
  showBranchSelector = true,
}: {
  branches: DashboardBranch[];
  selectedBranchId: string | null;
  period: DashboardPeriod;
  showBranchSelector?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilters(updates: {
    branch?: string;
    period?: DashboardPeriod;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.branch !== undefined) {
      if (updates.branch === "all") {
        params.delete("branch");
      } else {
        params.set("branch", updates.branch);
      }
    }

    if (updates.period) {
      params.set("period", updates.period);
    }

    startTransition(() => {
      router.replace(`/dashboard?${params.toString()}`, {
        scroll: false,
      });
    });
  }

  return (
    <div
      className={
        "flex flex-wrap items-center justify-end gap-3 transition-opacity " +
        (isPending ? "pointer-events-none opacity-60" : "")
      }
      aria-busy={isPending}
    >
      {showBranchSelector && (
        <>
          <label htmlFor="dashboard-branch" className="sr-only">
            Dashboard branch
          </label>
          <select
            id="dashboard-branch"
            value={selectedBranchId ?? "all"}
            onChange={(event) => updateFilters({ branch: event.target.value })}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </>
      )}

      <div className="flex rounded-lg border p-1">
        {([
          ["today", "Today"],
          ["7d", "7 Days"],
          ["30d", "30 Days"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => updateFilters({ period: value })}
            className={
              "rounded-md px-4 py-2 text-sm " +
              (period === value ? "bg-white text-black" : "")
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
