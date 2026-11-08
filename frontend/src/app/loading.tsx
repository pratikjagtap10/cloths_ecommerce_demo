// Shown automatically (via React Suspense) while a server page is loading.
export default function Loading() {
  return (
    <div className="container-page py-12">
      <div className="h-8 w-48 animate-pulse rounded bg-stone-200" />
      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-square animate-pulse rounded-lg bg-stone-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
