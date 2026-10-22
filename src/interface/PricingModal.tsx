import { ExternalLink, X, Sparkles } from 'lucide-react';
import React from 'react';
import { GEMINI_PRICING } from '../core/llm/pricing';
import { DEFAULT_MODEL } from '../core/llm/constants';

interface PricingModalProps {
  onClose: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ onClose }) => {
  const reasoningModels = Object.entries(GEMINI_PRICING)
    .sort(([a], [b]) => (a === DEFAULT_MODEL ? -1 : (b === DEFAULT_MODEL ? 1 : 0)));

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl"
      />
      <div
        className="relative w-full max-w-xl bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-12 border border-zinc-100 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mx-auto">
          {/* Header */}
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-darkDelegation tracking-tight mb-2">
              Gemini API Pricing
            </h2>
            <div className="flex flex-col items-center gap-3">
              <a
                href="https://ai.google.dev/gemini-api/docs/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 rounded-full transition-all duration-200"
              >
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-600">Official Pricing Page</span>
                <ExternalLink size={11} className="text-blue-500" />
              </a>
              <p className="text-zinc-500 text-xs font-medium leading-relaxed">
                Official Google Gemini API pricing (March 2026).
              </p>
            </div>
          </div>

          <div>
            <div className="space-y-10">
              {/* Reasoning Models */}
              <div className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 px-1 border-l-2 border-blue-500 pl-3">Reasoning Models</h3>
                <div className="space-y-3">
                  {reasoningModels.map(([model, pricing]) => {
                    const isDefault = model === DEFAULT_MODEL;
                    return (
                      <div key={model} className={`relative px-5 py-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                        isDefault ? 'bg-blue-50/80 border-blue-100 shadow-sm' : 'bg-zinc-50 border-zinc-100/60'
                      }`}>
                        {isDefault && (
                          <div className="absolute -top-2 left-4 flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase rounded-full tracking-widest shadow-sm">
                            <Sparkles size={8} className="fill-white" />
                            Default
                          </div>
                        )}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <p className="text-xs font-bold text-darkDelegation lowercase">
                            {model}
                          </p>
                          {isDefault && <Sparkles size={10} className="text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-5 text-xs font-mono font-bold">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tighter">In</span>
                            <span className="text-darkDelegation">${pricing.inputPer1M.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tighter">Out</span>
                            <span className="text-darkDelegation">${pricing.outputPer1M.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
