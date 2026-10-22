import { Handle, type NodeProps, Position } from "@xyflow/react"
import { User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { USER_COLOR } from "../../../theme/brand"
import { Avatar } from "../../components/Avatar"
import type { HandleData, VisualAgentNode } from "../teamFlowGraph"

const HANDLE_SPACING = 28
const PILL = "h-5 rounded-md px-1.5 text-[11px] font-black tracking-tight leading-none"

function NodeHandle({
  handle,
  slot,
  total,
  side,
}: {
  handle: HandleData
  slot: number
  total: number
  side: "top" | "bottom"
}) {
  return (
    <Handle
      type={handle.role}
      position={side === "top" ? Position.Top : Position.Bottom}
      id={handle.id}
      className="!w-2.5 !h-2.5 !border-white shadow-sm hover:scale-125 transition-transform"
      style={{
        left: `calc(50% + ${(slot - (total - 1) / 2) * HANDLE_SPACING}px)`,
        backgroundColor: handle.color,
        [side]: 0,
        transform: `translate(-50%, ${side === "top" ? "-50%" : "50%"})`,
      }}
    />
  )
}

/** Card for one team member in the flow: avatar, name, role, supervision and model. */
export function VisualFlowNode({ data, selected, type }: NodeProps<VisualAgentNode>) {
  const isUser = type === "user"
  const color = isUser ? USER_COLOR : data.color || "#ccc"

  return (
    <div
      className={cn(
        "relative w-fit min-w-[280px] rounded-2xl border-2 bg-background px-3 py-2.5 shadow-sm pointer-events-auto transition-all duration-300",
        selected ? "z-20 scale-105 shadow-lg" : "z-10",
        data.isDimmed ? "translate-y-1 opacity-20" : "opacity-100",
      )}
      style={{
        borderColor: color,
        boxShadow: selected
          ? `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05), 0 0 0 4px ${color}30`
          : undefined,
      }}
    >
      {data.topHandles.map((handle, slot) => (
        <NodeHandle
          key={handle.id}
          handle={handle}
          slot={slot}
          total={data.topHandles.length}
          side="top"
        />
      ))}
      {data.bottomHandles.map((handle, slot) => (
        <NodeHandle
          key={handle.id}
          handle={handle}
          slot={slot}
          total={data.bottomHandles.length}
          side="bottom"
        />
      ))}

      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-xl border border-border/50 bg-muted/40 p-0.5">
          <Avatar type={isUser ? "user" : data.isLead ? "lead" : "sub"} color={color} size={48} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={cn(
              "min-w-0 truncate text-[13px] font-black tracking-tight",
              isUser && "text-user",
            )}
          >
            {data.label}
          </div>

          {!isUser && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(PILL, "shadow-sm")}
                  style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
                >
                  {data.isLead ? "Lead agent" : "Subagent"}
                </Badge>
                {data.agent?.humanInTheLoop && (
                  <Badge
                    variant="outline"
                    className={cn(PILL, "border-user/20 bg-user/10 font-bold text-user")}
                  >
                    <User strokeWidth={3} />
                    Human-in-the-loop
                  </Badge>
                )}
              </div>
              <code className="w-fit rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] italic text-muted-foreground">
                {data.agent?.model}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
