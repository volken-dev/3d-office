
import React, { useState } from 'react';
import { getAgentSet, getAllAgents, getAllCharacters } from '../data/agents';
import { useUiStore } from '../integration/store/uiStore';
import InfoModal from './InfoModal';
import { useAgentAnchor } from '../integration/screenPositions';

import { MessageSquareWarning, PartyPopper, Siren } from 'lucide-react';
import { Task, useCoreStore } from '../integration/store/coreStore';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';
import { useShallow } from 'zustand/react/shallow';



interface AlertBubbleProps {
  icon: React.ReactNode;
  agentIndex: number;
  color?: string;
  onClick?: () => void;
}

const AlertBubble: React.FC<AlertBubbleProps> = ({ icon, agentIndex, color = '#facc15', onClick }) => {
  const anchorRef = useAgentAnchor<HTMLDivElement>(agentIndex);

  return (
    <div
      ref={anchorRef}
      className={`absolute left-0 top-0 z-20 will-change-transform ${onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <div
        className={`bg-darkDelegation/90 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${onClick ? 'hover:border-white/30' : ''}`}
        style={{ color }}
      >
        {icon}
      </div>
    </div>
  );
};

type PhaseLabel = { text: string; className: string };

function getAgentPhaseLabel(
  agentIndex: number,
  leadAgentIndex: number,
  tasks: Task[],
  phase: string,
  fallback: string,
): PhaseLabel {
  if (agentIndex === leadAgentIndex && phase === 'done') {
    return { text: 'Project Ready!', className: 'text-yellow-400' };
  }
  const holdTask = tasks.find(
    t => t.assignedAgentId === agentIndex && t.status === 'on_hold',
  );
  if (holdTask && phase !== 'done') {
    return { text: 'Approval Needed', className: 'text-[#7EACEA]' };
  }
  const activeTask = tasks.find(
    t => t.assignedAgentId === agentIndex && t.status === 'in_progress',
  );
  if (activeTask) {
    return { text: 'Working', className: 'text-emerald-400' };
  }
  return { text: fallback, className: 'text-white/70' };
}

interface AgentLabelBubbleProps {
  agent: { index: number; name: string; color: string };
  isUser: boolean;
  isProjectReady: boolean;
  label: PhaseLabel;
}

/** Name + status pill that follows a character around the scene. */
const AgentLabelBubble: React.FC<AgentLabelBubbleProps> = ({ agent, isUser, isProjectReady, label }) => {
  const anchorRef = useAgentAnchor<HTMLDivElement>(agent.index);

  return (
    <div ref={anchorRef} className="absolute left-0 top-0 z-25 pointer-events-none will-change-transform">
      <div className="bg-darkDelegation/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl flex items-center gap-2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-200">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: agent.color }}
        />
        <div className="flex items-center gap-1.5">
          {isUser ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{agent.name} (You)</span>
          ) : isProjectReady ? (
            <span className={`text-[10px] font-black uppercase tracking-widest ${label.className}`}>
              {label.text}
            </span>
          ) : (
            <>
              <span className="text-[10px] font-black uppercase tracking-widest text-white">
                {agent.name}
              </span>
              {label.text && (
                <>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">·</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${label.className}`}>
                    {label.text}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const UIOverlay: React.FC = () => {
  const { selectedNpcIndex, hoveredNpcIndex, hoveredPoiLabel, hoverPosition, setSelectedNpc } = useUiStore(useShallow((s) => ({ selectedNpcIndex: s.selectedNpcIndex, hoveredNpcIndex: s.hoveredNpcIndex, hoveredPoiLabel: s.hoveredPoiLabel, hoverPosition: s.hoverPosition, setSelectedNpc: s.setSelectedNpc })));
  const [isHelpOpen, setHelpOpen] = useState(false);
  const { tasks, phase } = useCoreStore(useShallow((s) => ({ tasks: s.tasks, phase: s.phase })));
  const system = useActiveTeam();
  const npcAgents = getAllAgents(system);
  const allPossibleAgents = getAllCharacters(system);

  const selectedAgent = selectedNpcIndex != null ? allPossibleAgents.find(a => a.index === selectedNpcIndex) as any ?? null : null;
  const hoveredAgent = hoveredNpcIndex != null ? allPossibleAgents.find(a => a.index === hoveredNpcIndex) as any ?? null : null;


  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      {/* 1. Parallel Alert Bubbles System */}
      {npcAgents.map((agent) => {
        // Condition: Alert disappears when hovered
        const isCurrentlyHovered = hoveredNpcIndex === agent.index || selectedNpcIndex === agent.index;
        if (isCurrentlyHovered) return null;

        let alertIcon: React.ReactNode = null;
        let alertColor = '#facc15'; // Default yellow

        // Check specific conditions
        // - Lead Agent (index 1) idle: siren
        if (agent.index === system.leadAgent.index && phase === 'idle') {
          alertIcon = <Siren size={18} />;
          alertColor = '#ffffff'; // White for siren
        }
        // - Lead Agent (index 1) project finished: party-popper
        else if (agent.index === system.leadAgent.index && phase === 'done') {
          alertIcon = <PartyPopper size={18} />;
          alertColor = '#facc15'; // Yellow
        }
        // - Any agent waiting for USER approval (target 0): message-square-warning
        else {
          const pendingTask = tasks.find(t => 
            t.status === 'on_hold' && 
            t.assignedAgentId === agent.index
          );
          if (pendingTask) {
            alertIcon = <MessageSquareWarning size={18} />;
            alertColor = USER_COLOR;
          }
        }

        if (!alertIcon) return null;

        return (
          <AlertBubble
            key={`alert-${agent.index}`}
            icon={alertIcon}
            agentIndex={agent.index}
            color={alertColor}
            onClick={() => setSelectedNpc(agent.index)}
          />
        );
      })}

      {/* 2. Selection/Hover/Project Ready Bubble (Detailed) */}
      {(() => {
        // Selected agent takes priority over hovered agent
        const agent = selectedAgent ?? (hoveredNpcIndex !== selectedNpcIndex ? hoveredAgent : null);
        if (!agent) return null;
        return (
          <AgentLabelBubble
            key={agent.index}
            agent={agent}
            isUser={agent.index === system.user.index}
            isProjectReady={agent.index === system.leadAgent.index && phase === 'done'}
            label={getAgentPhaseLabel(agent.index, system.leadAgent.index, tasks, phase, '')}
          />
        );
      })()}

      {/* POI Hover Bubble */}
      {hoveredPoiLabel && hoverPosition && (
        <div
          className="absolute z-10 pointer-events-none transition-all duration-75 ease-out"
          style={{
            left: hoverPosition.x,
            top: hoverPosition.y,
            transform: 'translate(-50%, -100%) translateY(-10px)'
          }}
        >
          <div className="bg-darkDelegation/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-xl flex items-center gap-2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-200">
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{hoveredPoiLabel}</span>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {isHelpOpen && <InfoModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

export default UIOverlay;
