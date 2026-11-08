"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";
import { USE_MOCK } from "@/lib/config";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof schema>;

function LoginFormCard() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }: LoginForm) => {
    setError(null);
    try {
      await login(email, password);
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-stone-500">Log in to check out and see your orders.</p>

      {USE_MOCK && (
        <button
          type="button"
          className="mt-4 w-full rounded border border-dashed border-amber-400 bg-amber-50 p-2 text-sm text-amber-900"
          onClick={() => {
            setValue("email", "demo@clothstore.com");
            setValue("password", "demo1234");
          }}
        >
          Fill demo credentials
        </button>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input id="email" type="email" autoComplete="email" className="input w-full" {...register("email")} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input w-full"
            {...register("password")}
          />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

// useSearchParams() must be inside a Suspense boundary
export default function LoginPage() {
  return (
    <div className="container-page">
      <Suspense>
        <LoginFormCard />
      </Suspense>
    </div>
  );
}
