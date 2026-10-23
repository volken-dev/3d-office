import { ExternalLink } from "@/components/external-link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BrandLogo, GitHubIcon } from "./components/brand-logo"

interface InfoModalProps {
  isOpen?: boolean
  onClose: () => void
}

/** About dialog: what The Delegation is and who made it. */
function InfoModal({ isOpen = true, onClose }: InfoModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl p-8 sm:max-w-xl md:p-10">
        <div className="mx-auto grid max-w-md gap-6">
          <BrandLogo className="mx-auto h-auto w-64" />

          <DialogHeader className="gap-6">
            <DialogTitle className="text-center text-3xl font-black leading-[1.2] tracking-tight">
              A no-code 3D playground to explore Agentic AI systems
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-6 text-center text-[15px] leading-relaxed sm:text-left">
                <p>
                  The Delegation is an experimental workspace where you stop prompting and start
                  delegating to a team of autonomous AI agents in a living 3D office.
                </p>
                <p>
                  Designed for enthusiasts, educators, and creative developers to understand
                  multi-agent collaboration, making complex AI processes transparent, collaborative,
                  and human-centered.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col items-center gap-6 sm:flex-col sm:justify-center">
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="rounded-xl px-8 text-xs font-black"
            >
              <ExternalLink href="https://github.com/arturitu/the-delegation">
                <GitHubIcon size={16} />
                View on GitHub
              </ExternalLink>
            </Button>

            <p className="w-full border-t border-border pt-4 text-center text-xs font-bold leading-loose text-muted-foreground">
              Developed by{" "}
              <ExternalLink
                href="https://unboring.net"
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Arturo Paracuellos (unboring.net)
              </ExternalLink>
            </p>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default InfoModal
