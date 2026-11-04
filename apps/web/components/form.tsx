"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "./ui";

export function SubmitButton({
  children,
  variant,
  size,
  className,
  pendingText,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </Button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role="status" className={cx("text-sm", state.error ? "text-danger" : "text-success")}>
      {state.error ?? state.ok}
    </p>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** A <form> that asks for confirmation before submitting a server action. */
export function ConfirmForm({
  action,
  message,
  children,
}: {
  action: (form: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
