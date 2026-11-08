"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";

const schema = z
  .object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
type RegisterForm = z.infer<typeof schema>;

const FIELDS: { name: keyof RegisterForm; label: string; type: string; half?: boolean }[] = [
  { name: "first_name", label: "First name", type: "text", half: true },
  { name: "last_name", label: "Last name", type: "text", half: true },
  { name: "email", label: "Email", type: "email" },
  { name: "password", label: "Password", type: "password" },
  { name: "confirm", label: "Confirm password", type: "password" },
];

function RegisterFormCard() {
  const { register: signUp } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ confirm: _confirm, ...input }: RegisterForm) => {
    setError(null);
    try {
      await signUp(input);
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 grid grid-cols-2 gap-4">
        {error && <p className="col-span-2 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {FIELDS.map((f) => (
          <div key={f.name} className={f.half ? "" : "col-span-2"}>
            <label htmlFor={f.name} className="mb-1 block text-sm font-medium">
              {f.label}
            </label>
            <input id={f.name} type={f.type} className="input w-full" {...register(f.name)} />
            {errors[f.name] && <p className="field-error">{errors[f.name]?.message}</p>}
          </div>
        ))}
        <button type="submit" disabled={isSubmitting} className="btn-primary col-span-2">
          {isSubmitting ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="container-page">
      <Suspense>
        <RegisterFormCard />
      </Suspense>
    </div>
  );
}
