import { toast } from "sonner";

import { errorMessage } from "@/lib/api/client";

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastError(error: unknown) {
  toast.error(errorMessage(error));
}

export function toastInfo(message: string) {
  toast(message);
}
