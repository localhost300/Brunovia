"use client";
import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
const schema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type Form = z.infer<typeof schema>;
export function Login({
  onSuccess,
  allowedRoles,
  portalName,
}: {
  onSuccess: (user: AppUser) => void;
  allowedRoles?: AppUser["role"][];
  portalName?: string;
}) {
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const submit = async (values: Form) => {
    try {
      if (!hasSupabaseConfig())
        throw new Error("Brunovia is not connected to Supabase");
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("full_name,role")
        .eq("id", data.user.id)
        .single();
      if (profileError) throw profileError;
      if (allowedRoles && !allowedRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error(
          `This account does not have access to the ${portalName ?? "requested"} portal.`,
        );
      }
      onSuccess({
        id: data.user.id,
        email: data.user.email ?? values.email,
        name: profile.full_name,
        role: profile.role,
      });
      toast.success("Signed in successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden lg:flex relative overflow-hidden bg-[#0e3c2e] p-12 text-white flex-col justify-between">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px,white 1px,transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <Brand light />
        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm">
            <ShieldCheck size={15} /> Trusted workforce intelligence
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight">
            Your people.
            <br />
            Your strongest advantage.
          </h1>
          <p className="mt-5 text-lg leading-8 text-emerald-100/80">
            Role-aware workforce operations in one secure workspace.
          </p>
        </div>
        <p className="relative text-xs text-emerald-100/50">
          Enterprise security · Row-level access · Audit-ready
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-10">
            <Brand />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Welcome back
          </h2>
          <p className="mt-2 text-zinc-500">
            Sign in to your {portalName ? `${portalName} portal` : "Brunovia workspace"}
          </p>
          <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">
            <Field label="Work email" error={errors.email?.message}>
              <input {...register("email")} className="input" />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <input
                  {...register("password")}
                  type={show ? "text" : "password"}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-3 text-zinc-400"
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <button
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  Sign in <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-zinc-400">
            <CheckCircle2 className="mr-1 inline" size={14} /> Protected by
            enterprise-grade security
          </p>
        </div>
      </section>
    </div>
  );
}
function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="relative flex items-center gap-2.5">
      <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-white/95 p-0.5">
        <Image
          src="/brunovia-logo.png"
          alt="Brunovia"
          width={34}
          height={34}
          priority
        />
      </span>
      <span className={`leading-tight ${light ? "text-white" : ""}`}>
        <span className="block text-lg font-semibold">Brunovia</span>
        <span
          className={`block text-[11px] ${light ? "text-emerald-100/70" : "text-zinc-500"}`}
        >
          Built for better business
        </span>
      </span>
    </div>
  );
}
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error && (
        <span className="mt-1 block text-xs text-red-500">{error}</span>
      )}
    </label>
  );
}
