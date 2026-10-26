import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormError } from "@/components/feedback/form-error";
import { toastSuccess } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { errorMessage } from "@/lib/api/client";
import { changePassword, updateMe } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/use-auth";
import { formatDate } from "@/lib/utils";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().email("Enter a valid email address."),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Use at least 8 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "", email: user?.email ?? "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const resetProfileForm = profileForm.reset;

  useEffect(() => {
    if (user) resetProfileForm({ name: user.name, email: user.email });
  }, [resetProfileForm, user]);

  const profileMutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      updateMe({ name: values.name.trim(), email: values.email.trim() }),
    onSuccess: (updated) => {
      setUser(updated);
      toastSuccess("Profile updated.");
      setProfileError(null);
    },
    onError: (error) => setProfileError(errorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toastSuccess("Password changed.");
      passwordForm.reset();
      setPasswordError(null);
    },
    onError: (error) => setPasswordError(errorMessage(error)),
  });

  if (!user) return null;

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        description="Manage your details and keep your account secure."
        actions={
          <Button
            variant="secondary"
            leftIcon={<LogOut className="size-4" />}
            onClick={async () => {
              await logout();
              void navigate({ to: "/" });
            }}
          >
            Sign out
          </Button>
        }
      />

      <div className="mt-7 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <Card className="h-fit p-5">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{user.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge
                  tone={
                    user.role === "ADMIN" ? "open" : user.role === "MANAGER" ? "pending" : "neutral"
                  }
                >
                  {user.role === "ADMIN"
                    ? "Administrator"
                    : user.role === "MANAGER"
                      ? "Manager"
                      : "Student"}
                </Badge>
                {!user.is_active ? <Badge tone="rejected">Inactive</Badge> : null}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-xs text-muted">
            <p>
              <span className="font-medium text-ink">Member since</span> ·{" "}
              {formatDate(user.created_at)}
            </p>
            <p>
              <span className="font-medium text-ink">Account ID</span> ·{" "}
              <span className="font-mono text-[0.65rem]">{user.id.slice(0, 8)}</span>
            </p>
          </div>
          {user.role !== "USER" ? (
            <div className="mt-4 rounded-[var(--radius-control)] border border-line bg-paper-deep/60 p-3 text-xs leading-5 text-muted">
              <ShieldCheck className="mb-1 size-4 text-cobalt" />
              You have staff access. Claim review tools are available from the staff workspace.
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-cobalt-soft text-cobalt">
                <UserRound className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Personal details</h2>
                <p className="text-xs text-muted">Used on reports and in conversations.</p>
              </div>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={profileForm.handleSubmit((values) => {
                setProfileError(null);
                profileMutation.mutate(values);
              })}
            >
              <FormError message={profileError} />
              <Field
                label="Full name"
                htmlFor="profile-name"
                error={profileForm.formState.errors.name?.message}
              >
                <Input id="profile-name" {...profileForm.register("name")} />
              </Field>
              <Field
                label="Email"
                htmlFor="profile-email"
                error={profileForm.formState.errors.email?.message}
              >
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                  <Input
                    id="profile-email"
                    type="email"
                    className="pl-10"
                    {...profileForm.register("email")}
                  />
                </div>
              </Field>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  isLoading={profileMutation.isPending}
                  disabled={!profileForm.formState.isDirty}
                >
                  Save details
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-paper-deep text-ink">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Password</h2>
                <p className="text-xs text-muted">Use at least 8 characters.</p>
              </div>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={passwordForm.handleSubmit((values) => {
                setPasswordError(null);
                passwordMutation.mutate(values);
              })}
            >
              <FormError message={passwordError} />
              <Field
                label="Current password"
                htmlFor="current-password"
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                <PasswordInput
                  id="current-password"
                  autoComplete="current-password"
                  {...passwordForm.register("currentPassword")}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="New password"
                  htmlFor="new-password"
                  error={passwordForm.formState.errors.newPassword?.message}
                >
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    {...passwordForm.register("newPassword")}
                  />
                </Field>
                <Field
                  label="Confirm new password"
                  htmlFor="confirm-new-password"
                  error={passwordForm.formState.errors.confirmPassword?.message}
                >
                  <PasswordInput
                    id="confirm-new-password"
                    autoComplete="new-password"
                    {...passwordForm.register("confirmPassword")}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" isLoading={passwordMutation.isPending}>
                  Change password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
