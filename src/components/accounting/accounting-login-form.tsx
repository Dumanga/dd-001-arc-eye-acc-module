"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Copyright, LockKeyhole, UserRound } from "lucide-react";

export function AccountingLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
  }>({});
  const reason = searchParams.get("reason");
  const sessionNotice =
    reason === "session-expired"
      ? "Your session expired. Please log in again."
      : reason === "access-denied"
        ? "You do not have access to any accounting modules. Contact an administrator."
        : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const nextFieldErrors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      nextFieldErrors.username = "Username is required.";
    }

    if (!password.trim()) {
      nextFieldErrors.password = "Password is required.";
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("portal", "ACCOUNTING");

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

      router.push("/accounting/admin");
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8f5ef] text-[#231f20]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,113,1,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(20,184,166,0.08),transparent_24%),linear-gradient(180deg,#fffdfa_0%,#f8f5ef_52%,#f3eee6_100%)]" />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-md rounded-[30px] border border-[#eee3d7] bg-[#fffdfa]/95 p-6 shadow-[0_20px_60px_rgba(35,31,32,0.08)] backdrop-blur sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-[18px] border border-[#f2e2d2] bg-[#fff5ea] p-3">
                <Image
                  src="/assets/logo-dob.png"
                  alt="Doctor of Bat logo"
                  width={48}
                  height={48}
                  className="h-10 w-auto"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ff7101]">
                  Accounting
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#231f20]">
                  Login
                </h1>
              </div>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <input type="hidden" name="portal" value="ACCOUNTING" />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f5853]">
                Username
              </span>
              <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-[#e9dece] bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition focus-within:border-[#ff7101] focus-within:shadow-[0_0_0_4px_rgba(255,113,1,0.10)]">
                <UserRound className="h-4 w-4 text-[#ff7101]" />
                <input
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setFieldErrors((current) => ({ ...current, username: undefined }));
                  }}
                  placeholder="Enter username"
                  autoComplete="username"
                  name="identifier"
                  aria-invalid={Boolean(fieldErrors.username)}
                  className="accounting-login-input w-full bg-transparent text-sm text-[#231f20] outline-none placeholder:text-[#a0968e]"
                />
              </div>
              {fieldErrors.username ? (
                <span className="mt-2 block text-sm text-[#c95d37]">
                  {fieldErrors.username}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f5853]">
                Password
              </span>
              <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-[#e9dece] bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition focus-within:border-[#ff7101] focus-within:shadow-[0_0_0_4px_rgba(255,113,1,0.10)]">
                <LockKeyhole className="h-4 w-4 text-[#ff7101]" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  name="password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="accounting-login-input w-full bg-transparent text-sm text-[#231f20] outline-none placeholder:text-[#a0968e]"
                />
              </div>
              {fieldErrors.password ? (
                <span className="mt-2 block text-sm text-[#c95d37]">
                  {fieldErrors.password}
                </span>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff7101] px-5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(255,113,1,0.28)] transition hover:-translate-y-0.5 hover:bg-[#eb6900] disabled:cursor-not-allowed disabled:bg-[#f1a366]"
            >
              {isSubmitting ? "Signing in..." : "Login"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>

            {sessionNotice ? (
              <div className="rounded-2xl border border-[#cfe6da] bg-[#edf8f1] px-4 py-3 text-sm text-[#2c7a59]">
                {sessionNotice}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-2xl border border-[#f3c4bb] bg-[#fff3f0] px-4 py-3 text-sm text-[#b94f37]">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[#8a817b]">
              <Copyright className="h-3.5 w-3.5" />
              <p>Solution by Dozen Digital (Pvt) Ltd</p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
