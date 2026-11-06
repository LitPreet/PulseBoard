import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label="PulseBoard home">
        <Logo className="text-lg" />
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</div>
    </main>
  );
}
