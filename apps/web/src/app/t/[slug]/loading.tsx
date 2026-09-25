import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
