import { AlertTriangle } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ResetModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

/** Confirms wiping the current project back to idle before a new one starts. */
function ResetModal({ isOpen, onClose, onConfirm }: ResetModalProps) {
  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      icon={<AlertTriangle />}
      title="Start new project?"
      description="This clears the current user brief, all tasks, logs and conversation histories. The team returns to their starting positions and the project goes back to idle. This cannot be undone."
      confirmLabel="Reset everything"
      onConfirm={onConfirm}
    />
  )
}

export default ResetModal
