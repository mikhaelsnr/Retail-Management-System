const tones: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  available: "bg-emerald-500/15 text-emerald-600",
  "in stock": "bg-emerald-500/15 text-emerald-600",
  sold: "bg-blue-500/15 text-blue-500",
  completed: "bg-blue-500/15 text-blue-500",
  inactive: "bg-zinc-500/15 text-zinc-500",
  "low stock": "bg-amber-500/15 text-amber-600",
  reserved: "bg-amber-500/15 text-amber-600",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = tones[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + tone}>{status}</span>;
}
