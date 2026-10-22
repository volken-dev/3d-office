"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: React.ReactNode
  onConfirm: () => void
  variant?: "default" | "destructive"
  icon?: React.ReactNode
  className?: string
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  variant = "destructive",
  icon,
  className,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn("rounded-3xl", className)}
        // The dialog is portaled, but React still bubbles its events to the
        // trigger's ancestors (e.g. a clickable Kanban card).
        onClick={(e) => e.stopPropagation()}
      >
        <AlertDialogHeader>
          {icon && (
            <AlertDialogMedia
              className={cn(
                "rounded-2xl",
                variant === "destructive" && "bg-destructive/10 text-destructive"
              )}
            >
              {icon}
            </AlertDialogMedia>
          )}
          <AlertDialogTitle className="text-xl font-black tracking-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            className="rounded-xl"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
export type { ConfirmDialogProps }
