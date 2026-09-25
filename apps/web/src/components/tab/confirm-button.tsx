"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Destructive actions always ask first. */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  children,
  ...buttonProps
}: ButtonProps & {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => unknown;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </DialogTrigger>
      <DialogContent size="sm" title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
