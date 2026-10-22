import { AlertCircle, ArrowUpRight, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import { ExternalLink } from "@/components/ExternalLink"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUiStore } from "../integration/store/uiStore"

interface BYOKModalProps {
  isOpen?: boolean
  onClose: () => void
}

const API_KEY_URL = "https://aistudio.google.com/app/apikey"
const KEY_SECURITY_URL = "https://ai.google.dev/gemini-api/docs/api-key"
const LONG_ERROR = 120

function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "••••••••"
}

/** Asks for the user's Gemini key (onboarding, replacement or after an auth error) and stores it in this browser. */
function BYOKModal({ isOpen = true, onClose }: BYOKModalProps) {
  const { savedKey, setLlmConfig, byokError } = useUiStore(
    useShallow((state) => ({
      savedKey: state.llmConfig.apiKey,
      setLlmConfig: state.setLlmConfig,
      byokError: state.byokError,
    })),
  )

  const [enteredKey, setEnteredKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [isErrorExpanded, setIsErrorExpanded] = useState(false)

  const hasSavedKey = !!savedKey
  const isOnboarding = !hasSavedKey && !byokError
  const trimmedKey = enteredKey.trim()

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmedKey) return
    if (setLlmConfig({ apiKey: trimmedKey })) {
      toast.success("Gemini API key saved")
    } else {
      toast.warning("Key saved for this session only", {
        description:
          "This browser blocked local storage, so you will need to enter it again next visit.",
      })
    }
    onClose()
  }

  const handleClear = () => {
    setEnteredKey("")
    setLlmConfig({ apiKey: "" })
    toast("Gemini API key removed from this browser")
  }

  const isLongError = !!byokError && byokError.length > LONG_ERROR
  const displayError =
    byokError && isLongError && !isErrorExpanded
      ? `${byokError.slice(0, LONG_ERROR - 10)}…`
      : byokError

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-3xl p-8 sm:max-w-md md:p-10">
        <form onSubmit={handleSave} className="grid gap-6">
          <DialogHeader className="gap-3 text-left">
            <DialogTitle className="text-2xl font-black tracking-tight sm:text-3xl">
              {isOnboarding ? "Connect your Gemini API key" : "Gemini API key"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {isOnboarding
                ? "The agents in this office run on Google Gemini. Paste your own API key to start delegating; you only pay Google for what the team uses."
                : "Your agents use this key to call Google Gemini."}
            </DialogDescription>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-fit rounded-full border-success/30 bg-success/10 text-xs font-black text-emerald-700 hover:bg-success/20 hover:text-emerald-800"
            >
              <ExternalLink href={API_KEY_URL}>
                Get a Gemini API key
                <ArrowUpRight />
              </ExternalLink>
            </Button>
          </DialogHeader>

          {byokError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-xs font-black text-destructive">API error</p>
                <div
                  className={`${isErrorExpanded ? "max-h-48" : "max-h-24"} overflow-y-auto pr-1`}
                >
                  <p className="whitespace-pre-wrap break-words text-xs leading-snug text-red-700">
                    {displayError}
                  </p>
                </div>
                {isLongError && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs font-bold text-destructive"
                    onClick={() => setIsErrorExpanded((expanded) => !expanded)}
                    aria-expanded={isErrorExpanded}
                  >
                    {isErrorExpanded ? "Show less" : "Show more"}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="byok-api-key" className="text-xs font-black text-muted-foreground">
                {hasSavedKey ? "Replace key" : "API key"}
              </Label>
              {hasSavedKey && (
                <Badge variant="secondary" className="gap-1 font-mono">
                  <KeyRound />
                  Saved: {maskKey(savedKey)}
                </Badge>
              )}
            </div>
            <div className="relative">
              <Input
                id="byok-api-key"
                type={showKey ? "text" : "password"}
                value={enteredKey}
                onChange={(event) => setEnteredKey(event.target.value)}
                placeholder={
                  hasSavedKey ? "Paste a new key to replace it" : "Paste your API key here"
                }
                autoComplete="off"
                spellCheck={false}
                aria-describedby="byok-key-help"
                className="h-12 rounded-2xl bg-muted/50 pr-12 font-mono placeholder:font-sans"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowKey((shown) => !shown)}
                aria-label={showKey ? "Hide key" : "Show key"}
                aria-pressed={showKey}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p id="byok-key-help" className="text-xs leading-relaxed text-muted-foreground">
              Stored in this browser only and sent directly to Google&apos;s Gemini API.{" "}
              <ExternalLink
                href={KEY_SECURITY_URL}
                className="font-medium text-foreground underline underline-offset-4 hover:text-user"
              >
                Restrict this key to this site
              </ExternalLink>{" "}
              in Google AI Studio.
            </p>
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost-destructive"
              onClick={handleClear}
              disabled={!hasSavedKey && !enteredKey}
              className="rounded-xl text-xs font-black"
            >
              <Trash2 />
              Clear
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={!trimmedKey}
              className="h-12 rounded-2xl px-10 text-xs font-black shadow-xl shadow-black/10"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default BYOKModal
