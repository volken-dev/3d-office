import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"
import { Check, Repeat2, X } from "lucide-react"

const LANE_OFFSET = 30
const LABEL_STAGGER = 18

/**
 * Boxy edge with deterministic lane offsets so parallel edges (success loops, retries) don't overlap.
 * Labels: 'OK' for success, 'KO:<retries>' for a rejected handoff. Success loops (A <-> B) flip
 * direction by id order so the two edges take opposite lanes, and a hash of the id separates
 * parallel edges of the same type.
 */
export function DirectionalEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  label,
}: EdgeProps) {
  const isSuccess = label === "OK"
  const isRetry = typeof label === "string" && label.startsWith("KO:")

  const directionFactor = source.localeCompare(target) > 0 ? 1 : -1
  const typeOffset = isSuccess ? LANE_OFFSET * directionFactor : isRetry ? -LANE_OFFSET : 0
  const idHash = id
    .split("")
    .reduce((total, character, position) => total + character.charCodeAt(0) * (position + 1), 0)
  const parallelOffset = ((idHash % 5) - 2) * 6

  const centerY = (sourceY + targetY) / 2 + typeOffset + parallelOffset
  const edgePath = `M ${sourceX},${sourceY} L ${sourceX},${centerY} L ${targetX},${centerY} L ${targetX},${targetY}`
  const labelX = (sourceX + targetX) / 2
  const labelY = centerY + (isSuccess ? LABEL_STAGGER : isRetry ? -LABEL_STAGGER : 0)
  const retryCount = isRetry ? label.split(":")[1] : null

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              opacity: style?.opacity ?? 1,
            }}
            className="flex items-center gap-1 p-0.5 transition-opacity duration-300"
          >
            {isSuccess ? (
              <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-success shadow-md">
                <Check size={12} strokeWidth={4} className="text-success-foreground" />
              </span>
            ) : (
              <>
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-destructive shadow-md">
                  <X size={12} strokeWidth={4} className="text-white" />
                </span>
                {retryCount && (
                  <span className="flex h-6 items-center gap-1.5 rounded-full border-2 border-white bg-white/95 px-2 py-0.5 shadow-md">
                    <Repeat2 size={12} strokeWidth={3} className="text-muted-foreground" />
                    <span className="text-[11px] font-black leading-none text-primary">
                      {retryCount}
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
