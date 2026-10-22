import { toast } from "sonner"

/** Copies text and reports the outcome through a toast (clipboard access can be denied or unavailable). */
export async function copyToClipboard(text: string, label = "Text"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
    return true
  } catch {
    toast.error("Copy failed. Select the text and copy it manually.")
    return false
  }
}
