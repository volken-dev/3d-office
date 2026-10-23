import { useShallow } from "zustand/react/shallow"
import { useCoreStore } from "../integration/store/coreStore"
import { useTeamRoster } from "../integration/store/teamStore"
import { useUiStore } from "../integration/store/uiStore"
import { selectAgent } from "./components/selectAgent"
import { AlertBubble, FocusedAgentLabel, getAlertForAgent, PoiBubble } from "./UIOverlayBubbles"

/** HTML labels over the canvas: alert bubbles, the focused agent's label (selection wins over hover) and POI hints. */
function UIOverlay() {
  const { selectedNpcIndex, hoveredNpcIndex, hoveredPoiLabel, hoverPosition } = useUiStore(
    useShallow((state) => ({
      selectedNpcIndex: state.selectedNpcIndex,
      hoveredNpcIndex: state.hoveredNpcIndex,
      hoveredPoiLabel: state.hoveredPoiLabel,
      hoverPosition: state.hoverPosition,
    })),
  )
  const { tasks, phase } = useCoreStore(
    useShallow((state) => ({ tasks: state.tasks, phase: state.phase })),
  )
  const { system, agents: npcAgents, byIndex } = useTeamRoster()

  const focusedIndex = selectedNpcIndex ?? hoveredNpcIndex
  const focusedAgent = focusedIndex !== null ? byIndex.get(focusedIndex) : undefined

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none">
      {npcAgents.map((agent) => {
        if (agent.index === hoveredNpcIndex || agent.index === selectedNpcIndex) return null
        const kind = getAlertForAgent(agent.index, system, phase, tasks)
        return (
          kind && <AlertBubble key={agent.index} kind={kind} agent={agent} onSelect={selectAgent} />
        )
      })}

      {focusedAgent && (
        <FocusedAgentLabel
          key={focusedAgent.index}
          agent={focusedAgent}
          system={system}
          phase={phase}
          tasks={tasks}
        />
      )}

      {hoveredPoiLabel && hoverPosition && (
        <PoiBubble label={hoveredPoiLabel} position={hoverPosition} />
      )}
    </div>
  )
}

export default UIOverlay
