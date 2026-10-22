import { Check, Pipette, TriangleAlert } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getBrightness, getDarkenedColor, MAX_BRIGHTNESS } from "./colorBrightness"
import { DEFAULT_AGENT_COLOR } from "./teamTree"

const PRESET_COLORS = [
  DEFAULT_AGENT_COLOR,
  "#6366F1",
  "#3B82F6",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#64748B",
  "#313437",
]

/** White text on this colour would be unreadable, so it is rejected as a team or agent colour. */
export function isColorTooLight(color: string): boolean {
  return getBrightness(color) > MAX_BRIGHTNESS
}

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  /** Accessible name of the trigger, e.g. "Agent color". */
  label: string
}

/** Preset and custom colour picker that refuses colours too light for white text and suggests a darker one. */
export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const customId = useId()
  const tooLight = isColorTooLight(color)
  const lastReadableColorRef = useRef(tooLight ? DEFAULT_AGENT_COLOR : color)

  useEffect(() => {
    if (!tooLight) lastReadableColorRef.current = color
  }, [color, tooLight])

  const suggestedColor = tooLight ? getDarkenedColor(color) : null

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            aria-label={`${label}: ${color}`}
            className="size-9 rounded-xl text-white shadow-sm hover:opacity-90"
            style={{ backgroundColor: color }}
          >
            <Pipette strokeWidth={2.5} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-3 rounded-xl">
          <p className="text-[11px] font-black text-muted-foreground">{label}</p>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((preset) => {
              const isSelected = preset.toLowerCase() === color.toLowerCase()
              return (
                <Button
                  key={preset}
                  type="button"
                  size="icon-sm"
                  aria-label={preset}
                  aria-pressed={isSelected}
                  onClick={() => onChange(preset)}
                  className="size-8 rounded-lg text-white hover:opacity-90"
                  style={{ backgroundColor: preset }}
                >
                  {isSelected && <Check strokeWidth={3} />}
                </Button>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <Label htmlFor={customId} className="text-xs font-bold text-muted-foreground">
              Custom color
            </Label>
            <Input
              id={customId}
              type="color"
              value={color}
              onChange={(event) => onChange(event.target.value)}
              className="h-8 w-12 cursor-pointer p-0.5 shadow-none"
            />
          </div>
        </PopoverContent>
      </Popover>

      {suggestedColor && (
        <div role="alert" className="flex max-w-60 flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold leading-tight text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            Too light for white text.
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="flex-1 text-[11px] font-black"
              onClick={() => onChange(lastReadableColorRef.current)}
            >
              Revert
            </Button>
            <Button
              type="button"
              size="xs"
              className="flex-[2] text-[11px] font-black text-white hover:opacity-90"
              style={{ backgroundColor: suggestedColor }}
              onClick={() => onChange(suggestedColor)}
            >
              Use suggested
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
