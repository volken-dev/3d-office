import { FileText } from 'lucide-react';
import React from 'react';
import { AgenticSystem } from '../../data/agents';
import { InfoTooltip } from './InfoTooltip';
import { USER_COLOR, USER_COLOR_SOFT } from '../../theme/brand';

interface TeamOutputBadgeProps {
  system: AgenticSystem;
  className?: string;
}

export const TeamOutputBadge: React.FC<TeamOutputBadgeProps> = ({ system, className = '' }) => {
  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 bg-zinc-50/50 border border-zinc-100/50 cursor-pointer rounded-xl backdrop-blur-sm ${className}`}>
      {/* Auto-Approve Status */}
      <InfoTooltip
        text={system.outputAutoApprove !== false
          ? 'Final deliverable is delivered automatically'
          : 'Final deliverable requires your review and approval'}
      >
        <div className="flex items-center gap-1.5">
          <FileText size={11} strokeWidth={2.5} className="text-zinc-400" />
          <div
            className="w-1 h-1 rounded-full"
            style={{
              backgroundColor: system.outputAutoApprove !== false ? '#10b981' : USER_COLOR,
              boxShadow: system.outputAutoApprove !== false ? undefined : `0 0 8px ${USER_COLOR_SOFT}`
            }}
          />
          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none whitespace-nowrap">
            {system.outputAutoApprove !== false ? 'AUTO APPROVE' : 'MANUAL REVIEW'}
          </span>
        </div>
      </InfoTooltip>
    </div>
  );
};
