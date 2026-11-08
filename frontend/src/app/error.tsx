"use client";

// Error boundary: shown when any page under app/ throws while rendering.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-24 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-stone-500">{error.message || "Unexpected error."}</p>
      <button onClick={reset} className="btn-primary mt-8">
        Try again
      </button>
    </div>
  );
}
