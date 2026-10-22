import { type AgenticSystem, getAllAgents } from "@the-delegation/agents/team"
import { Edit2, RotateCcw, Trash2, Users, X } from "lucide-react"
import type React from "react"
import { useEffect, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AGENTIC_SETS, DEFAULT_AGENTIC_SET_ID } from "../../data/agents"
import { useCoreStore } from "../../integration/store/coreStore"
import { useTeamStore } from "../../integration/store/teamStore"
import { useSceneManager } from "../../simulation/SceneContext"
import { TeamOutputBadge } from "../components/TeamOutputBadge"
import { ColorPicker, isColorTooLight } from "./ColorPicker"
import { FieldHint, MICRO_LABEL } from "./Field"
import { DEFAULT_AGENT_COLOR, type RequestDiscard } from "./teamTree"

type TeamDraft = Pick<AgenticSystem, "teamName" | "teamType" | "teamDescription" | "color"> & {
  outputAutoApprove: boolean
}

function draftFromSystem(system: AgenticSystem): TeamDraft {
  return {
    teamName: system.teamName || "",
    teamType: system.teamType || "",
    teamDescription: system.teamDescription || "",
    color: system.color || DEFAULT_AGENT_COLOR,
    outputAutoApprove: system.outputAutoApprove !== false,
  }
}

const TEAM_DRAFT_KEYS = [
  "teamName",
  "teamType",
  "teamDescription",
  "color",
  "outputAutoApprove",
] as const satisfies readonly (keyof TeamDraft)[]

function isDraftEqual(left: TeamDraft, right: TeamDraft): boolean {
  return TEAM_DRAFT_KEYS.every((key) => left[key] === right[key])
}

interface TeamCardProps {
  system: AgenticSystem
  isSelected: boolean
  isActive: boolean
  mode: "view" | "edit"
  onSelectTeam: (id: string) => void
  onModeChange: (mode: "view" | "edit") => void
  onDirtyChange: (dirty: boolean) => void
  /** Runs `action` immediately, or after the user confirms discarding unsaved edits. */
  requestDiscard: RequestDiscard
}

/**
 * One team in the editor's list, as a summary or as its edit form. The whole card selects the
 * team on click as a pointer convenience; the summary's inner button gives keyboard and
 * screen-reader users the same selection.
 */
export function TeamCard({
  system,
  isSelected,
  isActive,
  mode,
  onSelectTeam,
  onModeChange,
  onDirtyChange,
  requestDiscard,
}: TeamCardProps) {
  const isEditing = mode === "edit" && isSelected

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience only; the inner selection button is the accessible control
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users select through the inner selection button
    <div
      onClick={() => onSelectTeam(system.id)}
      className={cn(
        "relative rounded-2xl border-[3px] p-3.5 transition-all",
        isSelected ? "bg-muted/40 shadow-sm" : "cursor-pointer bg-background",
      )}
      style={{
        borderColor: isSelected ? system.color : isActive ? `${system.color}50` : "transparent",
      }}
    >
      {isEditing ? (
        <TeamEditForm
          key={system.id}
          system={system}
          onDone={() => onModeChange("view")}
          onDirtyChange={onDirtyChange}
          requestDiscard={requestDiscard}
        />
      ) : (
        <TeamSummary
          system={system}
          isSelected={isSelected}
          isActive={isActive}
          onEdit={() => onModeChange("edit")}
        />
      )}
    </div>
  )
}

function useTeamSwitcher() {
  const setActiveTeam = useTeamStore((state) => state.setActiveTeam)
  const scene = useSceneManager()
  return (id: string) => {
    scene?.resetScene()
    setActiveTeam(id)
  }
}

function TeamSummary({
  system,
  isSelected,
  isActive,
  onEdit,
}: {
  system: AgenticSystem
  isSelected: boolean
  isActive: boolean
  onEdit: () => void
}) {
  const switchTeam = useTeamSwitcher()
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const agentCount = useMemo(() => getAllAgents(system).length, [system])

  const handleSwitch = () => {
    const { actionLog, phase } = useCoreStore.getState()
    if (actionLog.length > 0 || phase !== "idle") setConfirmSwitch(true)
    else switchTeam(system.id)
  }

  return (
    <>
      {isSelected && (
        <Button
          variant="secondary"
          size="xs"
          onClick={onEdit}
          className="absolute top-3.5 right-3.5 z-10 rounded-xl text-[11px] font-black"
        >
          <Edit2 strokeWidth={2.5} />
          Edit team
        </Button>
      )}

      <Button
        variant="bare"
        size="bare"
        aria-pressed={isSelected}
        className={cn(
          "w-full items-start justify-start gap-3.5 rounded-xl text-left font-normal whitespace-normal",
          isSelected && "pr-28",
        )}
      >
        <span
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-white shadow-lg shadow-black/5"
          style={{ backgroundColor: system.color }}
        >
          <Users className="size-3.5 opacity-90" strokeWidth={3} />
          <span className="text-xs font-black leading-none">{agentCount}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-xs font-black leading-tight",
              system.teamName ? "text-primary" : "text-muted-foreground",
            )}
          >
            {system.teamName || "Untitled team"}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {system.teamType || "Unspecified type"}
          </span>
        </span>
      </Button>

      <div className="mt-3 mb-2.5 space-y-2 px-2">
        <TeamOutputBadge system={system} className="mt-1" />
        <p
          className={cn(
            "line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground",
            !system.teamDescription && "italic",
          )}
        >
          {system.teamDescription || "No description provided."}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Badge
          variant="secondary"
          className="gap-1.5 rounded-lg text-[11px] font-black text-muted-foreground"
        >
          <Users strokeWidth={3} />
          {agentCount} {agentCount === 1 ? "agent" : "agents"}
        </Badge>
        {isActive ? (
          <Badge
            className="text-[11px] font-black text-white"
            style={{ backgroundColor: system.color }}
          >
            Active
          </Badge>
        ) : (
          isSelected && (
            <Button
              size="xs"
              onClick={handleSwitch}
              className="rounded-full px-3 text-[11px] font-black shadow-md"
            >
              Switch
            </Button>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmSwitch}
        onOpenChange={setConfirmSwitch}
        title={`Switch to ${system.teamName || "this team"}?`}
        description="Switching teams ends the current project and clears its brief, tasks, logs and token usage."
        cancelLabel="Keep current project"
        confirmLabel="Switch team"
        onConfirm={() => switchTeam(system.id)}
      />
    </>
  )
}

interface TeamEditFormProps {
  system: AgenticSystem
  onDone: () => void
  onDirtyChange: (dirty: boolean) => void
  requestDiscard: RequestDiscard
}

function TeamEditForm({ system, onDone, onDirtyChange, requestDiscard }: TeamEditFormProps) {
  const { patchSystem, deleteCustomSystem, selectedAgentSetId } = useTeamStore(
    useShallow((state) => ({
      patchSystem: state.patchSystem,
      deleteCustomSystem: state.deleteCustomSystem,
      selectedAgentSetId: state.selectedAgentSetId,
    })),
  )
  const switchTeam = useTeamSwitcher()
  const ids = { name: useId(), type: useId(), description: useId(), autoApprove: useId() }

  const [draft, setDraft] = useState<TeamDraft>(() => draftFromSystem(system))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isDirty = !isDraftEqual(draft, draftFromSystem(system))
  const missing = {
    teamName: !draft.teamName.trim(),
    teamType: !draft.teamType.trim(),
    teamDescription: !draft.teamDescription.trim(),
  }
  const isValid =
    !missing.teamName &&
    !missing.teamType &&
    !missing.teamDescription &&
    !isColorTooLight(draft.color)

  const isBuiltIn = AGENTIC_SETS.some((builtIn) => builtIn.id === system.id)
  const isActive = system.id === selectedAgentSetId

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const update = (changes: Partial<TeamDraft>) =>
    setDraft((previous) => ({ ...previous, ...changes }))

  const handleSave = () => {
    if (!isValid) return
    patchSystem(system.id, draft)
    toast.success(`Saved ${draft.teamName}`)
    onDone()
  }

  const handleClose = () => {
    if (isDirty) requestDiscard(onDone, "team")
    else onDone()
  }

  const handleDelete = () => {
    if (isActive) switchTeam(DEFAULT_AGENTIC_SET_ID)
    deleteCustomSystem(system.id)
    toast(
      isBuiltIn
        ? `Reset ${system.teamName} to its defaults`
        : `Deleted ${system.teamName || "team"}`,
    )
    onDone()
  }

  const textField = (
    key: keyof typeof missing,
    id: string,
    label: string,
    control: React.ReactNode,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={MICRO_LABEL}>
        {label}
      </Label>
      {control}
      {missing[key] && (
        <p className="text-[11px] font-bold text-destructive">{label} is required.</p>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-[11px] font-black text-primary">Edit team</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClose}
          aria-label="Close team editor"
          className="text-muted-foreground"
        >
          <X strokeWidth={3} />
        </Button>
      </div>

      <div className="space-y-1.5">
        <span className={MICRO_LABEL}>Team color</span>
        <ColorPicker
          label="Team color"
          color={draft.color}
          onChange={(color) => update({ color })}
        />
      </div>

      {textField(
        "teamName",
        ids.name,
        "Team name",
        <Input
          id={ids.name}
          value={draft.teamName}
          aria-invalid={missing.teamName}
          onChange={(event) => update({ teamName: event.target.value })}
          className="rounded-xl bg-background font-medium"
        />,
      )}
      {textField(
        "teamType",
        ids.type,
        "Team type",
        <Input
          id={ids.type}
          value={draft.teamType}
          aria-invalid={missing.teamType}
          onChange={(event) => update({ teamType: event.target.value })}
          className="rounded-xl bg-background font-medium"
        />,
      )}
      {textField(
        "teamDescription",
        ids.description,
        "Description",
        <Textarea
          id={ids.description}
          value={draft.teamDescription}
          aria-invalid={missing.teamDescription}
          onChange={(event) => update({ teamDescription: event.target.value })}
          className="field-sizing-fixed h-20 resize-none rounded-xl bg-background font-medium leading-snug"
        />,
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Label htmlFor={ids.autoApprove} className="text-[11px] font-black text-primary">
              Auto-approve output
            </Label>
            <FieldHint
              label="Auto-approve output"
              text="When enabled, the lead agent delivers the final result as soon as all tasks are done, without waiting for your review."
            />
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">
            Deliver without review
          </span>
        </div>
        <Switch
          id={ids.autoApprove}
          checked={draft.outputAutoApprove}
          onCheckedChange={(outputAutoApprove) => update({ outputAutoApprove })}
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={!isValid}
        className="w-full rounded-xl text-[11px] font-black shadow-lg shadow-black/10"
      >
        Save changes
      </Button>

      <div className="flex justify-end border-t pt-2">
        <Button
          variant="ghost-destructive"
          size="xs"
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg text-[11px] font-black text-destructive"
        >
          {isBuiltIn ? <RotateCcw /> : <Trash2 />}
          {isBuiltIn ? "Reset team" : "Delete team"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={
          isBuiltIn
            ? `Reset ${system.teamName} to its defaults?`
            : `Delete ${system.teamName || "this team"}?`
        }
        description={
          <>
            {isBuiltIn
              ? "All your edits to this team and its agents will be lost."
              : "This team and its agents will be removed."}
            {isActive &&
              " It is the active team, so the current project will end and its tasks and logs will be cleared."}
          </>
        }
        confirmLabel={isBuiltIn ? "Reset" : "Delete"}
        onConfirm={handleDelete}
      />
    </div>
  )
}
