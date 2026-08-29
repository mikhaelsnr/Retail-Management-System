import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/require-permission";
import { DashboardFilters } from "@/components/dashboard-filters";

type DashboardProps = {
  searchParams: Promise<{
    period?: string;
    branch?: string;
  }>;
};

type DashboardBranch = {
  id: string;
  code: string;
  name: string;
};

type BranchName = {
  name: string;
};

type CustomerName = {
  full_name: string;
};

type DashboardProduct = {
  id: string;
  sku: string;
  name: string;
  cost_price: number;
  selling_price: number;
};

export default async function DashboardPage({
  searchParams,
}: DashboardProps) {
  const { user } = await requirePermission([
    "dashboard.view_all",
    "dashboard.view_branch",
  ]);

  const params = await searchParams;

  const period =
    params.period === "today" ||
    params.period === "7d" ||
    params.period === "30d"
      ? params.period
      : "7d";

  const supabase = await createClient();

  const [viewAllResult, profileResult, branchesResult] = await Promise.all([
    supabase.rpc("has_permission", {
      p_permission: "dashboard.view_all",
    }),
    supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("branches")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .overrideTypes<DashboardBranch[]>(),
  ]);

  const canViewAllBranches = viewAllResult.data === true;
  const branches = branchesResult.data ?? [];
  const requestedBranch = params.branch;
  const selectedGlobalBranch = branches.find(
    (branch) => branch.id === requestedBranch
  );
  const selectedBranchId = canViewAllBranches
    ? selectedGlobalBranch?.id ?? null
    : profileResult.data?.branch_id ?? null;
  const selectedBranch = branches.find(
    (branch) => branch.id === selectedBranchId
  );

  const now = new Date();

  let days = 7;

  if (period === "today") {
    days = 1;
  }

  if (period === "30d") {
    days = 30;
  }

  const periodStart = new Date(now);

  periodStart.setDate(
    periodStart.getDate() - (days - 1)
  );

  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(now);

  periodEnd.setHours(23, 59, 59, 999);

  let periodSalesQuery = supabase
    .from("sales")
    .select(`
      id,
      total_amount,
      created_at,
      branch:branches (
        name
      )
    `)
    .eq("status", "completed")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString());

  if (selectedBranchId) {
    periodSalesQuery = periodSalesQuery.eq("branch_id", selectedBranchId);
  }

  const { data: periodSales } = await periodSalesQuery
    .order("created_at")
    .overrideTypes<Array<{
      branch: BranchName | null;
    }>>();

  let periodItemsQuery = supabase
    .from("sale_items")
    .select(`
      quantity,
      sale:sales!inner (
        created_at,
        status
      )
    `)
    .eq("sale.status", "completed")
    .gte("sale.created_at", periodStart.toISOString())
    .lte("sale.created_at", periodEnd.toISOString());

  if (selectedBranchId) {
    periodItemsQuery = periodItemsQuery.eq("sale.branch_id", selectedBranchId);
  }

  const { data: periodItems } = await periodItemsQuery;

  let inventoryQuery = supabase
    .from("inventory")
    .select(`
      id,
      quantity,
      reserved_quantity,
      reorder_level,
      product:products (
        id,
        sku,
        name,
        cost_price,
        selling_price
      ),
      branch:branches (
        name
      )
    `);

  if (selectedBranchId) {
    inventoryQuery = inventoryQuery.eq("branch_id", selectedBranchId);
  }

  const { data: inventory } = await inventoryQuery
    .overrideTypes<Array<{
      product: DashboardProduct | null;
      branch: BranchName | null;
    }>>();

  let recentSalesQuery = supabase
    .from("sales")
    .select(`
      id,
      sale_number,
      total_amount,
      created_at,
      customer:customers (
        full_name
      ),
      branch:branches (
        name
      )
    `)
    .eq("status", "completed");

  if (selectedBranchId) {
    recentSalesQuery = recentSalesQuery.eq("branch_id", selectedBranchId);
  }

  const { data: recentSales } = await recentSalesQuery
    .order("created_at", {
      ascending: false,
    })
    .limit(5)
    .overrideTypes<Array<{
      customer: CustomerName | null;
      branch: BranchName | null;
    }>>();

  const inventoryValue =
    inventory?.reduce((sum, item) => {
      const cost =
        Number(item.product?.cost_price ?? 0);

      return sum + cost * item.quantity;
    }, 0) ?? 0;

  const lowStockItems =
    inventory?.filter((item) => {
      const available =
        item.quantity -
        item.reserved_quantity;

      return available <= item.reorder_level;
    }) ?? [];

  const branchSalesMap = new Map<string, number>();

  periodSales?.forEach((sale) => {
    const branchName =
      sale.branch?.name ?? "Unknown";

    branchSalesMap.set(
      branchName,
      (branchSalesMap.get(branchName) ?? 0) +
        Number(sale.total_amount)
    );
  });

  const branchSales = Array.from(
    branchSalesMap.entries()
  )
    .map(([name, amount]) => ({
      name,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const periodTotalSales =
    periodSales?.reduce(
      (sum, sale) =>
        sum + Number(sale.total_amount),
      0
    ) ?? 0;

  const periodTransactions =
    periodSales?.length ?? 0;

  const periodUnitsSold =
    periodItems?.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    ) ?? 0;

  type TrendPoint = {
    label: string;
    amount: number;
  };

  let trendData: TrendPoint[] = [];
  let trendLabel = "";
  const trendTotal = periodTotalSales;

  if (period === "today") {
    trendLabel = "Today by Hour";

    const hourlyMap = new Map<number, number>();

    for (let hour = 0; hour < 24; hour += 2) {
      hourlyMap.set(hour, 0);
    }

    periodSales?.forEach((sale) => {
      const date = new Date(sale.created_at);

      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          hour12: false,
        }).format(date)
      );

      const bucket = Math.floor(hour / 2) * 2;

      hourlyMap.set(
        bucket,
        (hourlyMap.get(bucket) ?? 0) +
          Number(sale.total_amount)
      );
    });

    trendData = Array.from(hourlyMap.entries()).map(
      ([hour, amount]) => ({
        label: new Date(
          2026,
          0,
          1,
          hour
        ).toLocaleTimeString("en-US", {
          hour: "numeric",
        }),
        amount,
      })
    );
  }

  if (period === "7d") {
    trendLabel = "Last 7 Days";

    const dailyMap = new Map<string, number>();

    for (let i = 0; i < 7; i++) {
      const date = new Date(periodStart);
      date.setDate(periodStart.getDate() + i);

      const key = date.toLocaleDateString("en-CA");

      dailyMap.set(key, 0);
    }

    periodSales?.forEach((sale) => {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(sale.created_at));

      dailyMap.set(
        key,
        (dailyMap.get(key) ?? 0) +
          Number(sale.total_amount)
      );
    });

    trendData = Array.from(dailyMap.entries()).map(
      ([date, amount]) => ({
        label: new Date(
          `${date}T00:00:00`
        ).toLocaleDateString("en-US", {
          weekday: "short",
        }),
        amount,
      })
    );
  }

  if (period === "30d") {
    trendLabel = "Last 30 Days";

    const dailyMap = new Map<string, number>();

    for (let i = 0; i < 30; i++) {
      const date = new Date(periodStart);
      date.setDate(periodStart.getDate() + i);

      const key = date.toLocaleDateString("en-CA");

      dailyMap.set(key, 0);
    }

    periodSales?.forEach((sale) => {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(sale.created_at));

      dailyMap.set(
        key,
        (dailyMap.get(key) ?? 0) +
          Number(sale.total_amount)
      );
    });

    trendData = Array.from(dailyMap.entries()).map(
      ([date, amount]) => ({
        label: new Date(
          `${date}T00:00:00`
        ).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        amount,
      })
    );
  }

  const maxTrendSales = Math.max(
    ...trendData.map((item) => item.amount),
    1
  );

  const branchSalesTitle =
    period === "today"
      ? "Sales by Branch Today"
      : period === "7d"
        ? "Sales by Branch — Last 7 Days"
        : "Sales by Branch — Last 30 Days";

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Dashboard
          </h1>

          <p className="text-sm text-muted-foreground">
            Business overview
          </p>
        </div>

        {canViewAllBranches ? (
          <DashboardFilters
            branches={branches}
            selectedBranchId={selectedBranchId}
            period={period}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {selectedBranch?.name ?? "Assigned Branch"}
            </span>
            <DashboardFilters
              branches={[]}
              selectedBranchId={null}
              period={period}
              showBranchSelector={false}
            />
          </div>
        )}
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            {period === "today"
              ? "Today's Sales"
              : period === "7d"
                ? "7-Day Sales"
                : "30-Day Sales"}
          </p>

          <p className="mt-2 text-2xl font-bold">
            ₱{periodTotalSales.toLocaleString()}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Transactions
          </p>

          <p className="mt-2 text-2xl font-bold">
            {periodTransactions}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Units Sold
          </p>

          <p className="mt-2 text-2xl font-bold">
            {periodUnitsSold}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Inventory Value
          </p>

          <p className="mt-2 text-2xl font-bold">
            ₱
            {inventoryValue.toLocaleString()}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Low Stock
          </p>

          <p className="mt-2 text-2xl font-bold">
            {lowStockItems.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border p-5">
          <h2 className="mb-4 text-lg font-semibold">
            {branchSalesTitle}
          </h2>

          {branchSales.length ? (
            <div className="space-y-3">
              {branchSales.map(
                (branch) => (
                  <div
                    key={branch.name}
                    className="flex justify-between border-b pb-2 last:border-b-0"
                  >
                    <span>
                      {branch.name}
                    </span>

                    <span className="font-medium">
                      ₱
                      {branch.amount.toLocaleString()}
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sales today.
            </p>
          )}
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="mb-4 text-lg font-semibold">
            Low Stock Products
          </h2>

          {lowStockItems.length ? (
            <div className="space-y-3">
              {lowStockItems
                .slice(0, 8)
                .map((item) => {
                  const available =
                    item.quantity -
                    item.reserved_quantity;

                  return (
                    <div
                      key={item.id}
                      className="flex justify-between border-b pb-2 last:border-b-0"
                    >
                      <div>
                        <div className="font-medium">
                          {item.product?.name}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {item.branch?.name} •{" "}
                          {item.product?.sku}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-medium">
                          {available}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Reorder at{" "}
                          {
                            item.reorder_level
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No low-stock products.
            </p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border p-5">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Sales Trend
            </h2>

            <p className="text-sm text-muted-foreground">
              {trendLabel}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {period === "today"
                ? "Today's Sales"
                : period === "7d"
                  ? "7-Day Sales"
                  : "30-Day Sales"}
            </p>

            <p className="text-xl font-bold">
              ₱{trendTotal.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex h-64 items-end gap-2 overflow-x-auto border-b px-4">
          {trendData.map((point, index) => {
            const height =
              (point.amount / maxTrendSales) * 100;

            return (
              <div
                key={`${point.label}-${index}`}
                className="flex h-full min-w-[44px] flex-1 flex-col items-center justify-end"
              >
                <div className="mb-2 text-[10px]">
                  {point.amount > 0
                    ? `₱${point.amount.toLocaleString()}`
                    : ""}
                </div>

                <div
                  className="w-full max-w-20 rounded-t bg-blue-500"
                  style={{
                    height:
                      point.amount > 0
                        ? `${Math.max(height, 6)}%`
                        : "0%",
                    minHeight:
                      point.amount > 0
                        ? "10px"
                        : "0px",
                  }}
                />

                <div className="mt-2 whitespace-nowrap text-[10px] text-muted-foreground">
                  {point.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-lg border p-5">
        <h2 className="mb-4 text-lg font-semibold">
          Recent Sales
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="p-3 text-left">
                  Sale #
                </th>

                <th className="p-3 text-left">
                  Date
                </th>

                <th className="p-3 text-left">
                  Branch
                </th>

                <th className="p-3 text-left">
                  Customer
                </th>

                <th className="p-3 text-right">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {recentSales?.length ? (
                recentSales.map(
                  (sale) => (
                    <tr
                      key={sale.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="p-3 font-mono">
                        {
                          sale.sale_number
                        }
                      </td>

                      <td className="p-3">
                        {new Date(
                          sale.created_at
                        ).toLocaleString()}
                      </td>

                      <td className="p-3">
                        {
                          sale.branch
                            ?.name
                        }
                      </td>

                      <td className="p-3">
                        {sale.customer
                          ?.full_name ??
                          "Walk-in Customer"}
                      </td>

                      <td className="p-3 text-right">
                        ₱
                        {Number(
                          sale.total_amount
                        ).toLocaleString()}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No sales yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
