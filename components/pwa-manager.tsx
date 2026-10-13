"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw, X, WifiOff } from "lucide-react";
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function PwaManager() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null),
    [online, setOnline] = useState(true),
    [hidden, setHidden] = useState(false),
    [reconnected, setReconnected] = useState(false),
    [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    navigator.serviceWorker?.register("/sw.js").then((reg) => {
      reg.update();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            setUpdateReady(true);
        });
      });
    });
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const on = () => {
        setOnline(true);
        setReconnected(true);
        window.setTimeout(() => setReconnected(false), 3500);
      },
      off = () => {
        setOnline(false);
        setReconnected(false);
      };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!online)
    return (
      <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-2xl">
        <WifiOff size={17} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">You’re offline</p>
          <p className="text-xs text-zinc-300">
            The offline shell remains available. Sensitive workforce data is not
            cached.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-white/10 p-2"
          aria-label="Retry connection"
        >
          <RefreshCw size={15} />
        </button>
      </div>
    );
  if (updateReady)
    return (
      <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-white p-3 shadow-2xl dark:bg-zinc-950">
        <RefreshCw size={18} className="text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Update ready</p>
          <p className="text-xs text-zinc-500">
            Restart Brunovia to use the latest version.
          </p>
        </div>
        <button
          onClick={async () => {
            const registration =
              await navigator.serviceWorker.getRegistration();
            registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          }}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white"
        >
          Update
        </button>
      </div>
    );
  if (reconnected)
    return (
      <div
        role="status"
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-sm items-center gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-sm text-white shadow-2xl"
      >
        <CheckCircle2 size={17} />
        <span>Back online. Live data can sync again.</span>
      </div>
    );
  if (!prompt || hidden) return null;
  return (
    <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-white p-3 shadow-2xl dark:bg-zinc-950">
      <span className="grid size-10 place-items-center rounded-xl bg-emerald-700 text-white">
        <Download size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Brunovia</p>
        <p className="truncate text-xs text-zinc-500">
          Faster access and offline support
        </p>
      </div>
      <button
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white"
      >
        Install
      </button>
      <button
        onClick={() => setHidden(true)}
        className="p-1 text-zinc-400"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
