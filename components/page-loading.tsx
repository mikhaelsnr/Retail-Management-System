export function PageLoading() {
  return <main className="p-6" role="status" aria-label="Loading page" aria-busy="true">
    <span className="sr-only">Loading page...</span>
    <div aria-hidden="true" className="motion-safe:animate-pulse space-y-6">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-4 w-64 rounded bg-muted" />
      <div className="rounded-lg border p-4 space-y-4">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 rounded bg-muted" />)}
      </div>
    </div>
  </main>;
}
