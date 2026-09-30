import { useEffect, useId, useRef, useState } from "react"

const INSTALL_COMMAND = "npm install @gitchad/babble"

export function InstallCommand() {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  const statusId = useId()
  const resetTimer = useRef<number | undefined>(undefined)
  const active = useRef(false)
  const pending = useRef(false)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      window.clearTimeout(resetTimer.current)
    }
  }, [])

  const copy = async () => {
    if (pending.current) return
    pending.current = true
    window.clearTimeout(resetTimer.current)
    setStatus("idle")
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      if (!active.current) return
      setStatus("copied")
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2000)
    } catch {
      if (active.current) setStatus("error")
    } finally {
      pending.current = false
    }
  }

  return (
    <div className="dialkit-root install-command" data-theme="light">
      <div className="install-row">
        <input
          className="dialkit-text-input install-input"
          aria-label="Install command"
          aria-describedby={statusId}
          value={INSTALL_COMMAND}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="dialkit-toolbar-add install-copy"
          aria-label="Copy install command"
          title={status === "copied" ? "Copied!" : "Copy install command"}
          onClick={() => void copy()}
        >
          <span
            className="copy-symbol"
            data-visible={status !== "copied"}
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
            </svg>
          </span>
          <span
            className="copy-symbol"
            data-visible={status === "copied"}
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3.5 8 3 3 6-6" />
            </svg>
          </span>
        </button>
      </div>
      <output
        id={statusId}
        aria-live="polite"
        className={status === "error" ? "install-feedback" : "sr-only"}
      >
        {status === "copied"
          ? "Copied install command."
          : status === "error"
            ? "Couldn't copy. Select the command to copy it manually."
            : ""}
      </output>
    </div>
  )
}
