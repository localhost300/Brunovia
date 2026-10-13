"use client";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function PasswordSetup({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8)
      return toast.error("Password must contain at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password created successfully");
    window.history.replaceState({}, "", window.location.pathname);
    onComplete();
  };
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-xl"
      >
        <h1 className="text-2xl font-semibold">Create your password</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Choose the password you will use to sign in to Brunovia.
        </p>
        <label className="mt-6 block text-sm font-medium">
          New password
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-2"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Confirm password
          <input
            required
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input mt-2"
          />
        </label>
        <button
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create password"}
        </button>
      </form>
    </div>
  );
}
