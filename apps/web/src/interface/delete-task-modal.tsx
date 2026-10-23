import { Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface DeleteTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  taskTitle?: string
}

/** Confirms removing a task from the board, naming it so the user knows which one goes. */
function DeleteTaskModal({ isOpen, onClose, onConfirm, taskTitle }: DeleteTaskModalProps) {
  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      icon={<Trash2 />}
      title="Delete task?"
      description={
        <>
          {taskTitle ? (
            <span className="font-semibold text-foreground">&ldquo;{taskTitle}&rdquo;</span>
          ) : (
            "This task"
          )}{" "}
          will be removed. This cannot be undone.
        </>
      }
      confirmLabel="Delete task"
      onConfirm={onConfirm}
    />
  )
}

export default DeleteTaskModal
