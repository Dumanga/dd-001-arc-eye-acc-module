"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        success: boolean;
        message: string;
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message || "Login failed.");
        setIsSubmitting(false);
        return;
      }

      router.push("/operation/admin");
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0f14] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-10%] top-[-10%] h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute bottom-[-20%] left-1/3 h-80 w-80 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.0)_35%,rgba(255,255,255,0.08)_70%,rgba(255,255,255,0.0)_100%)] opacity-70" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="flex flex-col justify-center gap-6">
            <span className="w-fit rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
              Doctor of Bat
            </span>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Repair operations, organized with intent.
            </h1>
            <p className="max-w-lg text-base text-white/70 sm:text-lg">
              Track repair jobs, staff updates, and deliveries in one focused system
              designed for the workshop floor.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white/60">Today&apos;s focus</p>
                <p className="mt-2 text-xl font-semibold">Queue clarity</p>
                <p className="mt-1 text-xs text-white/50">
                  Know which bats move next.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white/60">Protected access</p>
                <p className="mt-2 text-xl font-semibold">Role-based</p>
                <p className="mt-1 text-xs text-white/50">
                  Staff see only what they need.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/60">
                  Staff Login
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Welcome back</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                RBAC secured
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
              <input type="hidden" name="portal" value="OPERATION" />
              <label className="grid gap-2 text-sm text-white/70">
                Email or username
                <input
                  className="h-12 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-emerald-400/70 focus:bg-white/15"
                  placeholder="staff@doctorofbat.com"
                  type="text"
                  autoComplete="username"
                  name="identifier"
                />
              </label>
              <label className="grid gap-2 text-sm text-white/70">
                Password
                <input
                  className="h-12 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition focus:border-emerald-400/70 focus:bg-white/15"
                  placeholder="••••••••"
                  type="password"
                  autoComplete="current-password"
                  name="password"
                />
              </label>
              <div className="flex items-center justify-between text-xs text-white/60">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    value="true"
                    className="h-4 w-4 rounded border-white/30 bg-transparent text-emerald-400"
                  />
                  Keep me signed in
                </label>
              </div>
              <button
                type="submit"
                className="h-12 rounded-xl bg-emerald-400 text-sm font-semibold text-black shadow-[0_10px_30px_-15px_rgba(16,185,129,0.9)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-200"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
              {errorMessage ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-xs text-rose-100">
                  {errorMessage}
                </div>
              ) : null}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                Use your workshop credentials. Only authorized roles can access
                repair modules.
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
