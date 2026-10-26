import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorState } from "@/components/feedback/error-state";
import { FormError } from "@/components/feedback/form-error";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { ItemImage } from "@/components/items/item-image";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { deleteItemImage, updateItem, uploadItemImage } from "@/lib/api/endpoints";
import { useItem } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import { compressImage } from "@/lib/images";
import { CATEGORIES, LOCATIONS, toDateTimeLocal, toIso } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(3, "Add a short, specific title.").max(200),
  description: z.string().trim().min(20, "Add at least 20 characters.").max(5000),
  category: z.string().min(1, "Choose a category."),
  location: z.string().min(1, "Choose a location."),
  occurred_at: z.string().optional(),
  brand: z.string().trim().max(80).optional(),
  color: z.string().trim().max(40).optional(),
});

type FormValues = z.infer<typeof schema>;

export function EditReportPage() {
  const { itemId } = useParams({ strict: false }) as { itemId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const itemQuery = useItem(itemId);
  const item = itemQuery.data;
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      location: "",
      occurred_at: "",
      brand: "",
      color: "",
    },
  });

  useEffect(() => {
    if (!item) return;
    reset({
      title: item.title,
      description: item.description,
      category: item.category,
      location: item.location,
      occurred_at: toDateTimeLocal(item.occurred_at),
      brand: item.brand ?? "",
      color: item.color ?? "",
    });
  }, [item, reset]);

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateItem(itemId, {
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category,
        location: values.location,
        occurred_at: toIso(values.occurred_at ?? "") ?? null,
        brand: values.brand?.trim() || null,
        color: values.color?.trim() || null,
      }),
    onSuccess: (updated) => {
      toastSuccess("Report updated.");
      queryClient.setQueryData(queryKeys.item(itemId), updated);
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["my-items"] });
      void navigate({ to: "/items/$itemId", params: { itemId } });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      const compressed = await compressImage(file);
      return uploadItemImage(itemId, compressed);
    },
    onSuccess: () => {
      toastSuccess("Photo added.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
    },
    onError: toastError,
    onSettled: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteItemImage(itemId, imageId),
    onSuccess: () => {
      toastSuccess("Photo removed.");
      setImageToDelete(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
    },
    onError: toastError,
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    updateMutation.mutate(values);
  });

  if (itemQuery.isLoading) {
    return (
      <div className="container-page max-w-3xl space-y-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (itemQuery.isError || !item) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={itemQuery.error ?? new Error("Report not found.")}
          onRetry={() => void itemQuery.refetch()}
        />
      </div>
    );
  }

  if (!item.is_owner) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={new Error("You can only edit your own reports.")}
          title="Not your report"
        />
      </div>
    );
  }

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <Link
        to="/items/$itemId"
        params={{ itemId }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to report
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-ink">Edit report</h1>
      <p className="mt-2 text-sm text-muted">
        Keep the details accurate. Changes are visible on the public board.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
        <FormError message={formError} />
        <div className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
          <Field label="Title" htmlFor="title" error={errors.title?.message} required>
            <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title")} />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            required
          >
            <Textarea
              id="description"
              rows={6}
              aria-invalid={Boolean(errors.description)}
              {...register("description")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" error={errors.category?.message} required>
              <Select
                id="category"
                aria-invalid={Boolean(errors.category)}
                {...register("category")}
              >
                <option value="">Choose a category</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" htmlFor="location" error={errors.location?.message} required>
              <Select
                id="location"
                aria-invalid={Boolean(errors.location)}
                {...register("location")}
              >
                <option value="">Choose a location</option>
                {LOCATIONS.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="When" htmlFor="occurred_at" error={errors.occurred_at?.message}>
              <Input id="occurred_at" type="datetime-local" {...register("occurred_at")} />
            </Field>
            <Field label="Brand" htmlFor="brand" error={errors.brand?.message}>
              <Input id="brand" {...register("brand")} />
            </Field>
            <Field label="Color" htmlFor="color" error={errors.color?.message}>
              <Input id="color" {...register("color")} />
            </Field>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Photos</h2>
              <p className="mt-1 text-xs text-muted">Up to 4 photos per report.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={
                uploading ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )
              }
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || (item.images?.length ?? 0) >= 4}
            >
              Add photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                event.target.value = "";
              }}
            />
          </div>
          {item.images?.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {item.images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-line"
                >
                  <ItemImage src={image.url} alt={item.title} className="size-full" />
                  <button
                    type="button"
                    onClick={() => setImageToDelete(image.id)}
                    className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-xs text-muted">
              No photos yet. A clear photo helps people recognize the item.
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Link to="/items/$itemId" params={{ itemId }}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            isLoading={isSubmitting || updateMutation.isPending}
            disabled={!isDirty}
            leftIcon={<Save className="size-4" />}
          >
            Save changes
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(imageToDelete)}
        onOpenChange={(open) => {
          if (!open) setImageToDelete(null);
        }}
        title="Remove this photo?"
        description="The photo will be removed from the report. This cannot be undone."
        confirmLabel="Remove photo"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (imageToDelete) deleteMutation.mutate(imageToDelete);
        }}
      />
    </div>
  );
}
