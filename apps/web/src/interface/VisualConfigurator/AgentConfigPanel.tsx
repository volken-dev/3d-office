import type { AgentNode } from "@the-delegation/agents/team"
import { Check, CircleUser, Cpu, Pipette, Save, Target, Trash2, User, X, Zap } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "../../core/llm/constants"
import { Avatar } from "../components/Avatar"
import { ColorPicker, isColorTooLight } from "./ColorPicker"
import { DisabledReason, Field, FieldHint, MICRO_LABEL } from "./Field"
import { type AgentDraft, countDescendants } from "./teamTree"

interface AgentConfigPanelProps {
  /** The saved agent, used for its place in the hierarchy. */
  agent: AgentNode
  draft: AgentDraft
  isLead: boolean
  /** Names of the other characters in the team, lower-cased and trimmed. */
  takenNames: string[]
  mode: "view" | "edit"
  onChange: (changes: Partial<AgentDraft>) => void
  onSave: () => void
  onClose: () => void
  onRemove: () => void
  /** Set while the roster cannot change, e.g. during a running project. */
  lockedReason: string | null
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, "")
}

/** Side panel for viewing or editing one agent's name, model, colour, description and supervision. */
export function AgentConfigPanel({
  agent,
  draft,
  isLead,
  takenNames,
  mode,
  onChange,
  onSave,
  onClose,
  onRemove,
  lockedReason,
}: AgentConfigPanelProps) {
  const isView = mode === "view"
  const nameErrorId = useId()
  const supervisionId = useId()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const normalizedName = draft.name.toLowerCase().trim()
  const nameCollision = takenNames.includes(normalizedName)
  const nameError =
    normalizedName === ""
      ? "Name is required."
      : nameCollision
        ? "This name is already used in the team."
        : null
  const isValid = !nameError && !isColorTooLight(draft.color)

  const capabilities = useMemo(
    () =>
      [
        { label: "Set project brief", enabled: isLead },
        { label: "Propose tasks", enabled: (agent.subagents?.length ?? 0) > 0 },
        { label: "Execute and complete tasks", enabled: true },
        { label: "Autonomous reasoning", enabled: true },
        { label: "Deliver project", enabled: isLead },
      ].filter((capability) => capability.enabled),
    [isLead, agent.subagents],
  )

  const removedCount = countDescendants(agent)

  return (
    <div className="flex h-full w-80 flex-col overflow-hidden bg-background motion-safe:animate-in motion-safe:slide-in-from-left-4 motion-safe:fade-in motion-safe:duration-300">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar type={isLead ? "lead" : "sub"} color={draft.color} size={32} />
          <h3 className="truncate text-sm font-bold tracking-tight text-primary">
            {isLead ? "Lead agent info" : "Subagent info"}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close agent details"
          className="text-muted-foreground"
        >
          <X />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-5">
          {!isView && (
            <Field label="Agent color" icon={<Pipette />} readOnly>
              {() => (
                <ColorPicker
                  label="Agent color"
                  color={draft.color}
                  onChange={(color) => onChange({ color })}
                />
              )}
            </Field>
          )}

          <Field
            label="Name"
            icon={<CircleUser />}
            readOnly={isView}
            help="Letters, numbers and spaces only. The ID is auto-generated."
          >
            {(id) =>
              isView ? (
                <p className="text-sm font-bold text-primary">{draft.name}</p>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    id={id}
                    value={draft.name}
                    onChange={(event) => onChange({ name: sanitizeName(event.target.value) })}
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? nameErrorId : undefined}
                    className="rounded-xl bg-muted/40 font-bold"
                  />
                  {nameError && (
                    <p id={nameErrorId} className="text-[11px] font-bold text-destructive">
                      {nameError}
                    </p>
                  )}
                </div>
              )
            }
          </Field>

          <Field
            label="LLM model"
            icon={<Cpu />}
            readOnly={isView}
            help="The Gemini model this agent uses."
          >
            {(id) =>
              isView ? (
                <code className="block w-fit rounded-lg border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  {draft.model || DEFAULT_MODEL}
                </code>
              ) : (
                <Select
                  value={draft.model || DEFAULT_MODEL}
                  onValueChange={(model) => onChange({ model })}
                >
                  <SelectTrigger
                    id={id}
                    className="w-full rounded-xl bg-muted/40 font-mono text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS.map((model) => (
                      <SelectItem key={model} value={model} className="font-mono text-xs">
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            }
          </Field>

          <Field
            label="Description"
            icon={<Target />}
            readOnly={isView}
            help="The agent's role, expertise and operating guidelines."
          >
            {(id) =>
              isView ? (
                <p className="min-h-[120px] whitespace-pre-wrap rounded-xl border bg-muted/40 p-4 text-xs font-medium italic leading-relaxed text-muted-foreground">
                  {draft.description || "No description provided."}
                </p>
              ) : (
                <Textarea
                  id={id}
                  value={draft.description}
                  onChange={(event) => onChange({ description: event.target.value })}
                  placeholder="What is this agent specialized in? What are its primary goals and constraints?"
                  className="field-sizing-fixed h-48 resize-none rounded-xl bg-muted/40 text-xs font-medium leading-relaxed"
                />
              )
            }
          </Field>

          <Field
            label="Capabilities"
            icon={<Zap />}
            readOnly
            help="Tools are assigned automatically from the agent's role and place in the hierarchy."
          >
            {() => (
              <ul className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
                {capabilities.map(({ label }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-input">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-[11px] font-black tracking-tight text-foreground">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <User className="size-3.5 text-muted-foreground" />
              <span className={MICRO_LABEL}>Supervision</span>
              <FieldHint
                label="Supervision"
                text="When enabled, the agent pauses to submit its result for your review and feedback before finalizing."
              />
            </div>
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors",
                draft.humanInTheLoop ? "border-user/20 bg-user/10" : "bg-muted/40",
              )}
            >
              <Label htmlFor={supervisionId} className="flex flex-col items-start gap-1">
                <span
                  className={cn(
                    "text-[11px] font-black tracking-tight",
                    draft.humanInTheLoop ? "text-user" : "text-foreground",
                  )}
                >
                  Human-in-the-loop
                </span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">
                  Agent must request your validation before completing any task.
                </span>
              </Label>
              <Switch
                id={supervisionId}
                checked={draft.humanInTheLoop}
                onCheckedChange={(humanInTheLoop) => onChange({ humanInTheLoop })}
                disabled={isView}
                className="data-[state=checked]:bg-user"
              />
            </div>
          </div>
        </div>
      </ScrollArea>

      {!isView && (
        <div className="flex flex-col gap-2 border-t bg-muted/20 p-4">
          <Button
            onClick={onSave}
            disabled={!isValid}
            className="h-11 w-full rounded-2xl text-xs font-black shadow-lg shadow-black/5"
          >
            <Save strokeWidth={2.5} />
            Update agent
          </Button>
          {!isLead && (
            <DisabledReason reason={lockedReason} className="block w-full">
              <Button
                variant="ghost-destructive"
                onClick={() => setConfirmRemove(true)}
                disabled={!!lockedReason}
                className="w-full rounded-xl text-[11px] font-black text-destructive"
              >
                <Trash2 />
                Remove from team
              </Button>
            </DisabledReason>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${agent.name}?`}
        description={
          removedCount > 0
            ? `${agent.name} and the ${removedCount} ${removedCount === 1 ? "subagent" : "subagents"} reporting to it will be removed from this team.`
            : `${agent.name} will be removed from this team.`
        }
        confirmLabel="Remove"
        onConfirm={onRemove}
      />
    </div>
  )
}
