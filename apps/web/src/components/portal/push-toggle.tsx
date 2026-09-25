"use client";

import { BellOff, BellRing, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withBase } from "@/lib/paths";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Follow a target with browser push (preferred) or email. Push works on
 * Android, desktop and iOS 16.4+ home-screen apps — no carrier SMS gateways.
 */
export function PushToggle({
  slug,
  targetType,
  targetId,
  label,
}: {
  slug: string;
  targetType: "entry" | "judge" | "school" | "tournament";
  targetId: string;
  label: string;
}) {
  const storageKey = `opentab:follow:${targetType}:${targetId}`;
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    setSupported(
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    );
    try {
      setSubscribed(localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);

  async function enablePush() {
    setBusy(true);
    try {
      const { publicKey } = (await fetch(withBase("/api/push/key")).then((r) => r.json())) as {
        publicKey: string | null;
      };
      if (!publicKey) {
        setShowEmail(true);
        toast("Push isn't set up on this server — get emails instead.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications are blocked in your browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.register(withBase("/sw.js"), {
        scope: withBase("/"),
      });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await fetch(withBase("/api/follow"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          targetType,
          targetId,
          channel: "push",
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      localStorage.setItem(storageKey, "1");
      setSubscribed(true);
      toast.success("You'll get a notification the moment pairings are posted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn on notifications");
    } finally {
      setBusy(false);
    }
  }

  async function followEmail() {
    setBusy(true);
    const res = await fetch(withBase("/api/follow"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, targetType, targetId, channel: "email", endpoint: email }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("We'll email you when pairings are posted.");
      setShowEmail(false);
      localStorage.setItem(storageKey, "1");
      setSubscribed(true);
    } else toast.error((await res.json()).error ?? "Couldn't follow");
  }

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
        <BellRing className="size-4 text-success" aria-hidden /> Notifications on — you&apos;ll hear
        about new pairings instantly.
        <button
          type="button"
          className="ml-auto text-xs text-fg-muted underline-offset-2 hover:underline"
          onClick={() => {
            localStorage.removeItem(storageKey);
            setSubscribed(false);
          }}
        >
          <span className="sr-only">Turn off</span>
          <BellOff className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {supported && (
          <Button size="sm" onClick={enablePush} loading={busy}>
            <BellRing /> Turn on notifications
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setShowEmail((s) => !s)}>
          <Mail /> Email me instead
        </Button>
      </div>
      {showEmail && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void followEmail();
          }}
        >
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          <Button type="submit" size="md" loading={busy}>
            Follow
          </Button>
        </form>
      )}
    </div>
  );
}
