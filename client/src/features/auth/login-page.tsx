import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail } from "lucide-react";
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

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
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
      await authStore.login(values.email.trim(), values.password);
      const target = safeInternalPath(redirectTarget());
      if (target !== "/") window.location.assign(target);
      else void navigate({ to: "/" });
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : "Unable to sign in. Try again.");
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to track reports, claims, and conversations."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-cobalt hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
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
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          rightIcon={<ArrowRight className="size-4" />}
        >
          Sign in
        </Button>
      </form>

      {import.meta.env.DEV ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface/60 p-3.5">
          <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted uppercase">
            Demo accounts
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "Student", email: "student@campus.edu" },
              { label: "Manager", email: "manager@campus.edu" },
              { label: "Admin", email: "admin@campus.edu" },
            ].map((account) => (
              <button
                key={account.email}
                type="button"
                className="rounded-md border border-line bg-surface px-2.5 py-1 text-[0.7rem] text-muted transition-colors hover:border-cobalt/30 hover:text-cobalt"
                onClick={() => {
                  setValue("email", account.email, { shouldValidate: true });
                  setValue("password", "Campus123!", { shouldValidate: true });
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.65rem] text-muted-soft">Password: Campus123!</p>
        </div>
      ) : null}
    </AuthShell>
  );
}
