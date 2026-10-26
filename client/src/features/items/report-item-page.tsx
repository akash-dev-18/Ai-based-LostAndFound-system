import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ImagePlus, MapPin, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormError } from "@/components/feedback/form-error";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createItem, uploadItemImage } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/use-auth";
import { compressImage } from "@/lib/images";
import { CATEGORIES, cn, LOCATIONS, toIso } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(3, "Add a short, specific title.").max(200),
  description: z
    .string()
    .trim()
    .min(20, "Add at least 20 characters so it can be identified.")
    .max(5000),
  category: z.string().min(1, "Choose a category."),
  location: z.string().min(1, "Choose a location."),
  occurred_at: z.string().optional(),
  brand: z.string().trim().max(80).optional(),
  color: z.string().trim().max(40).optional(),
});

type FormValues = z.infer<typeof schema>;

type Photo = { id: string; file: File; preview: string };

const MAX_PHOTOS = 4;
const MAX_BYTES = 10 * 1024 * 1024;

export function ReportItemPage({ type }: { type: "LOST" | "FOUND" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUrlsRef = useRef(new Set<string>());
  const isLost = type === "LOST";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
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

  const description = watch("description") ?? "";
  const title = watch("title") ?? "";

  useEffect(() => {
    return () => {
      for (const url of photoUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const item = await createItem({
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category,
        location: values.location,
        type,
        occurred_at: toIso(values.occurred_at ?? "") ?? null,
        brand: values.brand?.trim() || null,
        color: values.color?.trim() || null,
      });
      const failed: string[] = [];
      for (const photo of photos) {
        try {
          const file = await compressImage(photo.file);
          await uploadItemImage(item.id, file);
        } catch {
          failed.push(photo.file.name);
        }
      }
      return { item, failed };
    },
    onSuccess: ({ item, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["my-items"] });
      if (failed.length > 0) {
        toastError(
          new Error(
            `${failed.length} photo${failed.length === 1 ? "" : "s"} could not be uploaded. You can add them from the report page.`,
          ),
        );
      } else {
        toastSuccess(isLost ? "Lost report posted." : "Found report posted. Thank you!");
      }
      void navigate({ to: "/items/$itemId", params: { itemId: item.id } });
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : "Unable to post report."),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setFileError(null);
    const next: Photo[] = [];
    for (const file of Array.from(files)) {
      if (photos.length + next.length >= MAX_PHOTOS) break;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setFileError("Use a JPG, PNG, or WebP image.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setFileError("Each image must be under 10 MB.");
        continue;
      }
      const preview = URL.createObjectURL(file);
      photoUrlsRef.current.add(preview);
      next.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        preview,
      });
    }
    if (next.length > 0) setPhotos((current) => [...current, ...next]);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const photo = current.find((entry) => entry.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.preview);
        photoUrlsRef.current.delete(photo.preview);
      }
      return current.filter((entry) => entry.id !== id);
    });
  };

  if (!user) return null;

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <div className="page-enter">
          <Link to="/" className="text-xs font-medium text-cobalt hover:underline">
            The board
          </Link>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">
            {isLost ? "Report something you lost." : "Report something you found."}
          </h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted">
            {isLost
              ? "The details you add now are what help the right person recognize it later."
              : "A clear photo and a precise place make it much easier for the owner to find this report."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 max-w-2xl space-y-8" noValidate>
            <FormError message={formError} />

            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-sm font-semibold text-ink">Item details</h2>
                <span className="text-[0.65rem] text-muted">* required</span>
              </div>

              <Field
                label={isLost ? "What did you lose?" : "What did you find?"}
                htmlFor="title"
                error={errors.title?.message}
                hint={`${title.length}/200`}
                required
              >
                <Input
                  id="title"
                  placeholder={
                    isLost ? "Blue Hydro Flask with stickers" : "Blue water bottle in Hartley"
                  }
                  aria-invalid={Boolean(errors.title)}
                  {...register("title")}
                />
              </Field>

              <Field
                label="Description"
                htmlFor="description"
                error={errors.description?.message}
                hint={`${description.length}/5000`}
                required
              >
                <Textarea
                  id="description"
                  rows={5}
                  placeholder={
                    isLost
                      ? "Where did you last have it? What makes it recognizable? Any marks, contents, or a case?"
                      : "Describe the item without revealing every detail. Where exactly was it, and what condition is it in?"
                  }
                  aria-invalid={Boolean(errors.description)}
                  {...register("description")}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Category"
                  htmlFor="category"
                  error={errors.category?.message}
                  required
                >
                  <Select
                    id="category"
                    aria-invalid={Boolean(errors.category)}
                    {...register("category")}
                  >
                    <option value="">Choose</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Brand" htmlFor="brand" hint="Optional" error={errors.brand?.message}>
                  <Input id="brand" placeholder="e.g. Hydro Flask" {...register("brand")} />
                </Field>
                <Field label="Color" htmlFor="color" hint="Optional" error={errors.color?.message}>
                  <Input id="color" placeholder="e.g. Cobalt blue" {...register("color")} />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <div className="border-b border-line pb-2">
                <h2 className="text-sm font-semibold text-ink">Where and when</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={isLost ? "Last seen at" : "Found at"}
                  htmlFor="location"
                  error={errors.location?.message}
                  required
                >
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
                <Field
                  label={isLost ? "When did you last see it?" : "When did you find it?"}
                  htmlFor="occurred_at"
                  hint="Optional"
                  error={errors.occurred_at?.message}
                >
                  <Input
                    id="occurred_at"
                    type="datetime-local"
                    max={new Date().toISOString().slice(0, 16)}
                    {...register("occurred_at")}
                  />
                </Field>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-sm font-semibold text-ink">Photos</h2>
                <span className="text-[0.65rem] text-muted">
                  {photos.length}/{MAX_PHOTOS} · optional
                </span>
              </div>
              <fieldset
                className={cn("min-w-0", fileError && "text-danger")}
                aria-label="Photo upload"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(event.dataTransfer.files);
                }}
              >
                <div
                  className={cn(
                    "rounded-md border border-dashed border-line-strong bg-surface/60 transition-colors hover:border-cobalt/40",
                    photos.length > 0 ? "p-2" : "p-3",
                  )}
                >
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="group relative aspect-square overflow-hidden rounded-md border border-line"
                        >
                          <img src={photo.preview} alt="" className="size-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.id)}
                            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-md bg-ink/75 text-white opacity-100 transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label="Remove photo"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                      {photos.length < MAX_PHOTOS ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-muted transition-colors hover:border-cobalt/40 hover:text-cobalt"
                        >
                          <ImagePlus className="size-5" aria-hidden="true" />
                          <span className="text-[0.6rem] font-medium">Add</span>
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-md px-3 py-8 text-center"
                    >
                      <span className="flex size-9 items-center justify-center rounded-md bg-cobalt-soft text-cobalt">
                        <UploadCloud className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium text-ink">
                        Drop photos here or choose files
                      </span>
                      <span className="text-[0.68rem] text-muted">
                        JPG, PNG, or WebP · up to 10 MB each
                      </span>
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[0.65rem] text-muted">
                  <span>Use a clear photo. Avoid ID numbers and bank cards.</span>
                  {fileError ? (
                    <span className="font-medium text-danger" role="alert">
                      {fileError}
                    </span>
                  ) : null}
                </div>
              </fieldset>
            </section>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.68rem] text-muted">
                Posting as <span className="font-medium text-ink">{user.name}</span>
              </p>
              <Button
                type="submit"
                size="lg"
                isLoading={isSubmitting || mutation.isPending}
                rightIcon={<ArrowRight className="size-4" />}
              >
                {isLost ? "Post lost report" : "Post found report"}
              </Button>
            </div>
          </form>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="border-b border-line p-4">
              <h2 className="text-sm font-semibold text-ink">Before you post</h2>
              <ul className="mt-3 space-y-2.5 text-xs leading-5 text-muted">
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-cobalt" />
                  Include one clear, well-lit photo when you can.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-cobalt" />
                  Keep receipts, ID numbers, and payment details out of photos.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-cobalt" />
                  For valuable found items, leave one identifying detail out.
                </li>
              </ul>
            </div>
            <div className="p-4">
              <h2 className="text-sm font-semibold text-ink">What happens next</h2>
              <ol className="mt-3 space-y-3 text-xs leading-5 text-muted">
                <li className="flex gap-2.5">
                  <span className="font-mono text-[0.65rem] text-cobalt">01</span>
                  <p>
                    <span className="font-medium text-ink">We index it.</span> Your report becomes
                    searchable and eligible for matching.
                  </p>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-mono text-[0.65rem] text-cobalt">02</span>
                  <p>
                    <span className="font-medium text-ink">Someone recognizes it.</span> They send a
                    claim with proof.
                  </p>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-mono text-[0.65rem] text-cobalt">03</span>
                  <p>
                    <span className="font-medium text-ink">Staff review.</span> Once approved, you
                    arrange a safe handover.
                  </p>
                </li>
              </ol>
            </div>
          </div>

          <p className="mt-3 flex gap-2 text-[0.68rem] leading-5 text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Choose the closest building or landmark. Add more detail in the description.
          </p>
          <p className="mt-2 flex gap-2 text-[0.68rem] leading-5 text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-found" aria-hidden="true" />
            Claims are reviewed before contact details are shared.
          </p>
        </aside>
      </div>
    </div>
  );
}
