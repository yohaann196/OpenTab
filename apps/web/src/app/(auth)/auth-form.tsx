"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/tab";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [email, setEmail] = useState("");

  async function onSubmit(form: FormData) {
    setPending(true);
    setError(null);
    const emailV = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email: emailV,
            password,
            name: String(form.get("name") ?? "").trim(),
          })
        : await authClient.signIn.email({ email: emailV, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await authClient.signIn.magicLink({ email, callbackURL: next });
    setPending(false);
    if (res.error) setError(res.error.message ?? "Couldn't send the link");
    else setMagicSent(true);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "sign-up" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-sm text-fg-muted">
          {mode === "sign-up"
            ? "Run tournaments, manage your tab staff, and keep your history."
            : "Sign in to your tab room."}
        </p>
      </div>
      {error && <Alert tone="danger" title={error} />}
      {magicSent ? (
        <Alert tone="success" icon={Mail} title="Check your email">
          We sent a sign-in link to {email}. It expires in 5 minutes.
        </Alert>
      ) : (
        <form action={onSubmit} className="space-y-4">
          {mode === "sign-up" && (
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" autoComplete="name" required minLength={2} />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            hint={mode === "sign-up" ? "At least 8 characters." : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={8}
            />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
          {mode === "sign-in" && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={sendMagicLink}
              disabled={pending}
            >
              <Mail /> Email me a sign-in link
            </Button>
          )}
        </form>
      )}
      <p className="text-center text-sm text-fg-muted">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="font-medium text-brand hover:underline"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to OpenTab?{" "}
            <Link
              href={`/sign-up?next=${encodeURIComponent(next)}`}
              className="font-medium text-brand hover:underline"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
