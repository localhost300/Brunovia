"use client";

import {
  AlertTriangle,
  Inbox,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";

export function PageLoading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div
      className="min-h-dvh bg-[#f7f8f7] p-4 dark:bg-[#0b0c0c] sm:p-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="mx-auto flex max-w-7xl gap-5">
        <div className="hidden h-[calc(100dvh-3rem)] w-60 animate-pulse rounded-2xl bg-white dark:bg-zinc-950 lg:block" />
        <div className="flex-1 space-y-5">
          <div className="h-16 animate-pulse rounded-2xl bg-white dark:bg-zinc-950" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl bg-white dark:bg-zinc-950"
              />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-white dark:bg-zinc-950" />
          <p className="flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="animate-spin" size={16} />
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-center">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
          <Inbox size={20} />
        </span>
        <h3 className="mt-3 font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          {description}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function LoadingState({
  label = "Loading records…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-40 items-center justify-center gap-2 text-sm text-zinc-500"
    >
      <Loader2 className="animate-spin text-emerald-700" size={18} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid min-h-64 place-items-center rounded-2xl border border-red-200 bg-red-50/60 p-6 text-center dark:border-red-900 dark:bg-red-950/20"
    >
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle size={22} />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
        {retry && (
          <button
            onClick={retry}
            className="mt-5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <RefreshCw className="mr-2 inline" size={15} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function OfflineState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-3"
          : "grid min-h-64 place-items-center p-6 text-center"
      }
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
        <WifiOff size={20} />
      </span>
      <div className={compact ? "text-left" : "mt-3"}>
        <h2 className="font-semibold">You’re offline</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Cached information is available. Changes that require the server
          should be retried after reconnecting.
        </p>
      </div>
    </div>
  );
}
