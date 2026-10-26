import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormError } from "@/components/feedback/form-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthError, authStore } from "@/lib/auth/auth-store";
import { useAuth } from "@/lib/auth/use-auth";
import { redirectTarget, safeInternalPath } from "@/lib/navigation";

import { AuthShell } from "./auth-shell";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(120),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters.").max(128, "Password is too long."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (isAuthenticated) {
      const target = redirectTarget();
      if (target !== "/") window.location.assign(target);
      else void navigate({ to: "/" });
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authStore.register(values.name.trim(), values.email.trim(), values.password);
      const target = safeInternalPath(redirectTarget());
      if (target !== "/") window.location.assign(target);
      else void navigate({ to: "/" });
    } catch (error) {
      setFormError(
        error instanceof AuthError ? error.message : "Unable to create your account. Try again.",
      );
    }
  });

  return (
    <AuthShell
      title="Create your account"
      description="Report lost items, claim what’s yours, and keep every handover in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-cobalt hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <div className="relative">
            <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="name"
              autoComplete="name"
              placeholder="Alex Morgan"
              className="pl-10"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
          </div>
        </Field>
        <Field label="Campus email" htmlFor="email" error={errors.email?.message}>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@campus.edu"
              className="pl-10"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="8+ characters"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
          </Field>
          <Field label="Confirm" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">
          By creating an account you agree to keep handovers safe and meet in public campus spaces.
        </p>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          rightIcon={<ArrowRight className="size-4" />}
        >
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
