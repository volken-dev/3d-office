import { DEFAULT_LEAD_MODEL_ID, DEFAULT_TEAM_MODEL_ID, MODELS } from "@the-delegation/llm/registry"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { ExternalLink } from "@/components/external-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface PricingModalProps {
  isOpen?: boolean
  onClose: () => void
}

const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing"

const DEFAULT_MODEL_IDS: ReadonlySet<string> = new Set([
  DEFAULT_LEAD_MODEL_ID,
  DEFAULT_TEAM_MODEL_ID,
])

function formatPrice(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** Per-model token prices, so the user can see what a run will cost. */
function PricingModal({ isOpen = true, onClose }: PricingModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl p-8 sm:max-w-xl md:p-12">
        <DialogHeader className="items-center gap-3 text-center sm:text-center">
          <DialogTitle className="text-3xl font-black tracking-tight">Model pricing</DialogTitle>
          <DialogDescription>
            Prices in USD per 1M tokens, as listed by Google. Check the official page for current
            rates.
          </DialogDescription>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-full border-user/30 bg-user/10 text-xs font-black text-blue-700 hover:bg-user/20 hover:text-blue-800"
          >
            <ExternalLink href={PRICING_URL}>
              Official pricing page
              <ArrowUpRight />
            </ExternalLink>
          </Button>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-black text-muted-foreground">Model</TableHead>
              <TableHead className="text-right text-xs font-black text-muted-foreground">
                Input
              </TableHead>
              <TableHead className="text-right text-xs font-black text-muted-foreground">
                Output
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MODELS.map(({ id: model, pricing }) => {
              const isDefault = DEFAULT_MODEL_IDS.has(model)
              return (
                <TableRow
                  key={model}
                  className={isDefault ? "bg-user/10 hover:bg-user/15" : undefined}
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{model}</span>
                      {isDefault && (
                        <Badge className="bg-blue-600 text-[11px] font-black text-white">
                          <Sparkles className="fill-white" />
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {formatPrice(pricing.inputPer1M)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {formatPrice(pricing.outputPer1M)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}

export default PricingModal
