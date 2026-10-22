import { useState, useEffect } from 'react'
import { useCoreStore } from '../integration/store/coreStore'
import { useActiveTeam } from '../integration/store/teamStore'
import { useSceneManager } from '../simulation/SceneContext'
import { Type, X, Check, AlertCircle } from 'lucide-react'

export function OutputReviewModal() {
  const isReviewingOutput = useCoreStore((s) => s.isReviewingOutput)
  const setReviewingOutput = useCoreStore((s) => s.setReviewingOutput)
  const pendingOutputPrompt = useCoreStore((s) => s.pendingOutputPrompt)
  const resetProject = useCoreStore((s) => s.resetProject)

  const activeTeam = useActiveTeam()
  const scene = useSceneManager()
  const [prompt, setPrompt] = useState(pendingOutputPrompt)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)

  // Sync internal state when store changes
  useEffect(() => {
    if (isReviewingOutput) {
      setPrompt(pendingOutputPrompt)
      setIsConfirmingReset(false)
    }
  }, [isReviewingOutput, pendingOutputPrompt])

  if (!isReviewingOutput) return null

  const handleApprove = () => {
    scene?.getLeadBrain()?.finalizeOutput(prompt)
  }

  const handleCancelAndReset = () => {
    setIsConfirmingReset(true)
  }

  const confirmReset = () => {
    resetProject()
    setIsConfirmingReset(false)
    setReviewingOutput(false)
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-darkDelegation/40 backdrop-blur-md p-4"
      onClick={handleCancelAndReset}
    >
      <div
        className="bg-white border border-black/10 rounded-[32px] w-180 max-w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-zinc-100 bg-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-darkDelegation flex items-center justify-center text-white shadow-lg">
              <Type size={24} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-darkDelegation flex items-center gap-2">
                Review Final Deliverable
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                The lead agent has synthesized the team's work. Edit it before delivery.
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelAndReset}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-all active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8 bg-zinc-50/30">
          {/* Deliverable Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                DELIVERABLE
              </label>
              <div className="px-2 py-0.5 bg-zinc-100 rounded text-[9px] font-bold text-zinc-400 tracking-tighter">
                EDITABLE
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-72 bg-white border border-zinc-200 rounded-2xl p-4 text-sm text-zinc-700 leading-relaxed font-mono focus:ring-2 focus:ring-darkDelegation outline-none resize-none shadow-sm"
              placeholder="Final deliverable (Markdown)..."
            />
          </div>

          <div className="bg-darkDelegation rounded-[24px] p-6 text-white space-y-4 shadow-xl">
            <div>
              <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Team</p>
              <p className="text-xs font-black">{activeTeam.teamName}</p>
            </div>
            <p className="pt-4 border-t border-white/10 text-[10px] leading-relaxed text-zinc-400 italic">
              "This is the final phase. Edit the deliverable as needed. Once approved, the project will be marked complete."
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-zinc-100 flex justify-end items-center bg-white gap-3">
          <button
            onClick={handleCancelAndReset}
            className="px-6 py-3 bg-white border border-zinc-200 text-zinc-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-zinc-50 hover:text-red-500 hover:border-red-500 transition-all active:scale-[0.98]"
          >
            Cancel & Reset Project
          </button>

          <button
            onClick={handleApprove}
            className="px-8 py-3 bg-darkDelegation text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-black active:scale-[0.98] transition-all shadow-lg shadow-black/10 flex items-center gap-2"
          >
            <Check size={14} strokeWidth={3} />
            Approve & Deliver
          </button>
        </div>
      </div>

      {/* Confirmation Modal Overlay */}
      {isConfirmingReset && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-darkDelegation/40 backdrop-blur-md p-4 cursor-default"
          onClick={(e) => {
            e.stopPropagation()
            setIsConfirmingReset(false)
          }}
        >
          <div
            className="bg-white border border-black/10 rounded-[24px] w-96 p-8 shadow-2xl flex flex-col items-center text-center gap-6 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
              <AlertCircle size={32} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-darkDelegation">Are you absolutely sure?</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                All progress will be lost and the project will be reset to its initial state. This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                onClick={confirmReset}
                className="w-full py-4 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-red-600 active:scale-[0.98] transition-all"
              >
                Yes, Reset Project
              </button>
              <button
                onClick={() => setIsConfirmingReset(false)}
                className="w-full py-4 bg-zinc-100 text-zinc-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-zinc-200 active:scale-[0.98] transition-all"
              >
                No, Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
