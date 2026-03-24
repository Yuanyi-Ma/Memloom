import { toast } from "sonner";

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  if (type === "success") {
    toast.success(message);
  } else if (type === "error") {
    toast.error(message);
  } else {
    toast.info(message);
  }
}

// Legacy component signature kept for gradual migration compatibility
export function Toast(_props: { message: string; type: string; onClose: () => void }) {
  return null;
}
