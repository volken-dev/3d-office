import type { ProjectPhase, Task, TaskStatus } from "@the-delegation/agents/project/types"
import { type AgenticSystem, getAllAgents, hasSameRoster } from "@the-delegation/agents/team"
import type { AgentWork, SceneIntent, SceneViewMode } from "@the-delegation/scene/scene-intent"
import { castForTeam } from "./scene-cast"

/** The project state the scene reacts to. */
export interface ProjectSceneState {
  tasks: readonly Task[]
  phase: ProjectPhase
}

/** The layout state the scene reacts to. */
export interface LayoutSceneState {
  viewMode: SceneViewMode
  isResizing: boolean
}

/** The chat state the scene reacts to. */
export interface ChatSceneState {
  isChatting: boolean
  isThinking: boolean
  isTyping: boolean
  selectedNpcIndex: number | null
}

function isBusyStatus(status: TaskStatus): boolean {
  return status === "in_progress" || status === "on_hold" || status === "scheduled"
}

/** Who has unfinished work, and whether the project is delivered. */
export function agentWorkFor(project: ProjectSceneState): AgentWork {
  const busy = new Set(
    project.tasks.filter((task) => isBusyStatus(task.status)).map((task) => task.assignedAgentId),
  )
  return { busyAgentIndices: [...busy], isProjectDone: project.phase === "done" }
}

/** Agent indices in roster order, to tell a roster change from an edit of the same agents. */
/**
 * Where one agent should go after its tasks changed: on hold to the boardroom, in progress to a
 * desk, just done back to spawn. Null when none of its tasks changed status or nothing applies.
 */
function movementFor(
  agentIndex: number,
  deskSlot: number,
  previousTasks: readonly Task[],
  nextTasks: readonly Task[],
): SceneIntent | null {
  const agentTasks = nextTasks.filter((task) => task.assignedAgentId === agentIndex)
  const hasStatusChange = agentTasks.some((task) => {
    const previousTask = previousTasks.find((candidate) => candidate.id === task.id)
    return !previousTask || previousTask.status !== task.status
  })
  if (!hasStatusChange) return null

  if (agentTasks.some((task) => task.status === "on_hold"))
    return { type: "goToBoardroom", agentIndex }
  if (agentTasks.some((task) => task.status === "in_progress"))
    return { type: "goToDesk", agentIndex, deskSlot }
  const isJustDone = agentTasks.some(
    (task) =>
      task.status === "done" &&
      !previousTasks.some(
        (previousTask) => previousTask.id === task.id && previousTask.status === "done",
      ),
  )
  return isJustDone ? { type: "returnToSpawn", agentIndex } : null
}

/**
 * Intents for a project change: the drivers' work state whenever tasks or phase change, then a
 * move for each team agent whose tasks changed status. Only agents on the team's roster move, so
 * tasks assigned to the user (whatever its index) or to a removed agent never move a character.
 */
export function projectIntents(
  previous: ProjectSceneState,
  next: ProjectSceneState,
  team: AgenticSystem,
): SceneIntent[] {
  if (previous.tasks === next.tasks && previous.phase === next.phase) return []
  const intents: SceneIntent[] = [{ type: "syncAgentWork", work: agentWorkFor(next) }]
  if (previous.tasks === next.tasks) return intents

  const assignedAgentIndices = new Set(next.tasks.map((task) => task.assignedAgentId))
  const rosterAgents = getAllAgents(team)
  rosterAgents.forEach((agent, deskSlot) => {
    if (agent.index === team.user.index || !assignedAgentIndices.has(agent.index)) return
    const movement = movementFor(agent.index, deskSlot, previous.tasks, next.tasks)
    if (movement) intents.push(movement)
  })
  return intents
}

/** Intents for a layout change: a Kanban resize starting or ending, and design mode. */
export function layoutIntents(previous: LayoutSceneState, next: LayoutSceneState): SceneIntent[] {
  const intents: SceneIntent[] = []
  if (!previous.isResizing && next.isResizing) intents.push({ type: "layoutResizeStarted" })
  if (previous.isResizing && !next.isResizing) intents.push({ type: "layoutResizeSettled" })
  if (previous.viewMode !== next.viewMode)
    intents.push({ type: "setViewMode", viewMode: next.viewMode })
  return intents
}

/**
 * Intents for a chat change. A chat starting with a selected agent walks the user over; while it
 * is open, who is speaking follows thinking and typing; when it ends, both return to idle.
 */
export function chatIntents(previous: ChatSceneState, next: ChatSceneState): SceneIntent[] {
  const intents: SceneIntent[] = []
  if (previous.isChatting !== next.isChatting)
    intents.push({ type: "setChatMode", isChatting: next.isChatting })
  if (
    previous.isChatting === next.isChatting &&
    previous.isThinking === next.isThinking &&
    previous.isTyping === next.isTyping
  )
    return intents

  const chatAgentIndex = next.selectedNpcIndex
  if (next.isChatting && chatAgentIndex !== null) {
    if (!previous.isChatting) intents.push({ type: "startChat", agentIndex: chatAgentIndex })
    intents.push({
      type: "updateChatTurn",
      agentIndex: chatAgentIndex,
      isAgentSpeaking: next.isThinking,
      isUserSpeaking: next.isTyping,
    })
  } else if (!next.isChatting && previous.isChatting) {
    intents.push({ type: "stopChat", agentIndex: previous.selectedNpcIndex })
  }
  return intents
}

/** Intents for a team change: a rebuild when the team or its roster differs, else an update. */
export function teamIntents(previous: AgenticSystem, next: AgenticSystem): SceneIntent[] {
  if (previous === next) return []
  return [
    { type: hasSameRoster(previous, next) ? "updateTeam" : "replaceTeam", cast: castForTeam(next) },
  ]
}

/** The state a freshly connected scene needs before any change arrives. */
export function initialSceneIntents(
  project: ProjectSceneState,
  layout: LayoutSceneState,
  chat: ChatSceneState,
): SceneIntent[] {
  const intents: SceneIntent[] = [
    { type: "syncAgentWork", work: agentWorkFor(project) },
    { type: "setViewMode", viewMode: layout.viewMode },
    { type: "setChatMode", isChatting: chat.isChatting },
  ]
  if (layout.isResizing) intents.push({ type: "layoutResizeStarted" })
  return intents
}

/** The agent a click selects: none for the user's own character or empty space. */
export function selectionForClick(clickedIndex: number | null, team: AgenticSystem): number | null {
  return clickedIndex !== team.user.index ? clickedIndex : null
}
