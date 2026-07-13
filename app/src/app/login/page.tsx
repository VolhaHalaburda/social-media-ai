"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/context/session-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();

  // null = still checking whether any account exists yet
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => setNeedsSetup(!!d.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsSetup ? { name, email, password } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      await refresh();
      router.replace(searchParams.get("next") || "/videos");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f11] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#5e6ad2]">
            <Film className="h-4 w-4 text-white" />
          </div>
          <span className="text-[16px] font-semibold text-[#e2e2e5] tracking-tight">Virality System</span>
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#111113] p-6">
          {needsSetup === null ? (
            <div className="flex items-center justify-center py-8 text-[#6e6e7a]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <h1 className="text-[15px] font-semibold text-[#e2e2e5]">
                {needsSetup ? "Create the admin account" : "Sign in"}
              </h1>
              <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-[#8a8a96]">
                {needsSetup
                  ? "No accounts exist yet. This first account becomes the workspace admin."
                  : "Sign in with your workspace account."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {needsSetup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-[12px] text-[#a8a8b3]">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[12px] text-[#a8a8b3]">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[12px] text-[#a8a8b3]">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={needsSetup ? 8 : undefined}
                    autoComplete={needsSetup ? "new-password" : "current-password"}
                    className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]"
                  />
                </div>

                {error && (
                  <p className="rounded-[6px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#5e6ad2] text-[13px] font-medium text-white hover:bg-[#6b76e0]"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : needsSetup ? (
                    "Create account & sign in"
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
