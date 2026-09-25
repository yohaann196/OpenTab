"use client";

import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { publishStandingsAction, unpublishStandingsAction } from "@/app/tab/actions";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

export function PublishStandingsButtons({
  slug,
  eventId,
  published,
}: {
  slug: string;
  eventId: string;
  published: boolean;
}) {
  const { exec, pending } = useAction();
  return published ? (
    <>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => exec(() => publishStandingsAction(slug, eventId))}
      >
        <RefreshCw /> Update public standings
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => exec(() => unpublishStandingsAction(slug, eventId))}
      >
        <EyeOff /> Hide
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      loading={pending}
      onClick={() => exec(() => publishStandingsAction(slug, eventId))}
    >
      <Eye /> Publish standings
    </Button>
  );
}
