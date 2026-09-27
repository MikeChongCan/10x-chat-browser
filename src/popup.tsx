import React, { useState, useEffect, useRef } from "react"
import { sendToBackground } from "./lib/messaging"
import { i18n, i18nCount } from "./lib/i18n"
import { Button } from "./components/ui/button"
import { Textarea } from "./components/ui/textarea"
import { Checkbox } from "./components/ui/checkbox"
import { Label } from "./components/ui/label"
import iconUrl from "../assets/icon.png"
import { 
  GearSix, 
  SpinnerGap,
  RocketLaunch,
  ArrowsClockwise,
  ListChecks,
  X,
  Paperclip,
  Image as ImageIcon,
  Trash
} from "@phosphor-icons/react"
import "./style.css"

export interface AttachedImage {
  id: string
  name: string
  type: string
  dataUrl: string
  size: number
}

interface ServiceConfig {
  chatgpt: boolean
  grok: boolean
  gemini: boolean
  perplexity: boolean
  claude: boolean
}

const SERVICE_ICONS: Record<string, string> = {
  chatgpt: "⚡",
  grok: "𝕏",
  gemini: "✦",
  perplexity: "🔍",
  claude: "◉"
}

const sendQueryToBackground = sendToBackground

function IndexPopup() {
  const [query, setQuery] = useState("")
  const [images, setImages] = useState<AttachedImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [notice, setNotice] = useState("")
  const [closePreviousTabs, setClosePreviousTabs] = useState(false)
  const [continuousMode, setContinuousMode] = useState(false)
  const [integrationMode, setIntegrationMode] = useState(false)
  const [enabledServices, setEnabledServices] = useState<ServiceConfig>({
    chatgpt: true,
    grok: true,
    gemini: true,
    perplexity: true,
    claude: true
  })

  const CACHE_KEY = "cachedQuery"
  const CACHE_IMAGES_KEY = "cachedImages"
  const CLOSE_TABS_KEY = "closePreviousTabsEnabled"
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // dragenter/dragleave also fire when crossing child elements, so track depth
  // instead of toggling on every leave — otherwise the overlay flickers.
  const dragDepthRef = useRef(0)
  // Async FileReader batches need the latest list without making the state
  // updater impure, so mirror it here and always write through commitImages.
  const imagesRef = useRef<AttachedImage[]>([])

  const commitImages = (next: AttachedImage[]) => {
    imagesRef.current = next
    setImages(next)
  }

  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0
  const submitKeyHint = isMac ? "⌘↵" : "Ctrl+↵"

  useEffect(() => {
    chrome.storage.sync.get(["enabledServices", "continuousMode", "integrationMode"], (result) => {
      if (result.enabledServices) {
        setEnabledServices(result.enabledServices)
      }
      if (typeof result.continuousMode === "boolean") {
        setContinuousMode(result.continuousMode)
      }
      if (typeof result.integrationMode === "boolean") {
        setIntegrationMode(result.integrationMode)
      }
    })

    chrome.storage.local.get([CACHE_KEY, CACHE_IMAGES_KEY, CLOSE_TABS_KEY], (result) => {
      if (result[CACHE_KEY]) {
        setQuery(result[CACHE_KEY])
      }
      if (Array.isArray(result[CACHE_IMAGES_KEY])) {
        commitImages(result[CACHE_IMAGES_KEY])
      }
      if (result[CLOSE_TABS_KEY]) {
        setClosePreviousTabs(result[CLOSE_TABS_KEY])
      }
    })

    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(""), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const cacheQuery = (value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(() => {
      chrome.storage.local.set({ [CACHE_KEY]: value })
    }, 250)
  }

  // Every attached image is base64-inflated (~33%) and then crosses two
  // message hops — popup → background → content script — before it is
  // uploaded. Keep both a per-file and a whole-batch ceiling so an attachment
  // that previews fine cannot fail silently on delivery. The cache ceiling is
  // lower still, because chrome.storage.local is capped at 10 MB overall.
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024
  const MAX_TOTAL_BYTES = 15 * 1024 * 1024
  const MAX_CACHE_BYTES = 4 * 1024 * 1024

  const cacheImages = (updatedImages: AttachedImage[]) => {
    const bytes = updatedImages.reduce((sum, img) => sum + img.dataUrl.length, 0)
    if (bytes > MAX_CACHE_BYTES) {
      chrome.storage.local.remove(CACHE_IMAGES_KEY)
      setNotice(i18n("imageCacheFull"))
      return
    }
    chrome.storage.local.set({ [CACHE_IMAGES_KEY]: updatedImages }, () => {
      if (chrome.runtime.lastError) {
        setNotice(i18n("imageCacheFull"))
      }
    })
  }

  const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setQuery(value)
    cacheQuery(value)
  }

  const processFiles = (fileList: FileList | File[]) => {
    const candidates = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/")
    )
    if (candidates.length === 0) return

    // Collect every problem in this batch — a later warning must not silently
    // replace an earlier one.
    const problems: string[] = []

    const oversized = candidates.filter((f) => f.size > MAX_IMAGE_BYTES)
    if (oversized.length > 0) {
      problems.push(
        i18n("imageTooLarge", [
          oversized[0].name,
          String(MAX_IMAGE_BYTES / (1024 * 1024))
        ])
      )
    }
    const filesArray = candidates.filter((f) => f.size <= MAX_IMAGE_BYTES)
    if (filesArray.length === 0) {
      setNotice(problems.join(" · "))
      return
    }

    // Resolve to null on failure so one unreadable file cannot leave the whole
    // Promise.all pending and silently swallow the batch.
    const readPromises = filesArray.map((file) => {
      return new Promise<AttachedImage | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result
          if (typeof dataUrl !== "string" || dataUrl.length === 0) {
            resolve(null)
            return
          }
          resolve({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            type: file.type,
            dataUrl,
            size: file.size
          })
        }
        reader.onerror = () => resolve(null)
        reader.onabort = () => resolve(null)
        try {
          reader.readAsDataURL(file)
        } catch {
          resolve(null)
        }
      })
    })

    Promise.all(readPromises).then((results) => {
      const newImgs = results.filter((img): img is AttachedImage => img !== null)
      if (newImgs.length < filesArray.length) {
        problems.push(i18n("imageReadFailed"))
      }
      if (newImgs.length === 0) {
        setNotice(problems.join(" · "))
        return
      }

      const prev = imagesRef.current

      // Dedupe on the decoded bytes: two different screenshots often share a
      // filename and can share a byte length, so name+size is not identity.
      const seen = new Set(prev.map((img) => img.dataUrl))
      const deduped = newImgs.filter((img) => {
        if (seen.has(img.dataUrl)) return false
        seen.add(img.dataUrl)
        return true
      })

      // Trim anything that would push the batch past what the messaging hop
      // can carry, rather than failing at delivery time.
      const accepted: AttachedImage[] = []
      let total = prev.reduce((sum, img) => sum + img.dataUrl.length, 0)
      for (const img of deduped) {
        if (total + img.dataUrl.length > MAX_TOTAL_BYTES) {
          problems.push(
            i18n("imageTooLarge", [
              img.name,
              String(MAX_IMAGE_BYTES / (1024 * 1024))
            ])
          )
          continue
        }
        total += img.dataUrl.length
        accepted.push(img)
      }

      setNotice(problems.join(" · "))
      if (accepted.length === 0) return

      const updated = [...prev, ...accepted]
      commitImages(updated)
      cacheImages(updated)
    })
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      processFiles(imageFiles)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  const handleRemoveImage = (id: string) => {
    const updated = imagesRef.current.filter((img) => img.id !== id)
    commitImages(updated)
    cacheImages(updated)
  }

  const handleClearImages = () => {
    commitImages([])
    chrome.storage.local.remove(CACHE_IMAGES_KEY)
  }

  const handleReset = () => {
    setQuery("")
    commitImages([])
    chrome.storage.local.remove([CACHE_KEY, CACHE_IMAGES_KEY])
    textareaRef.current?.focus()
  }

  const handleCloseTabsToggle = () => {
    const newValue = !closePreviousTabs
    setClosePreviousTabs(newValue)
    chrome.storage.local.set({ [CLOSE_TABS_KEY]: newValue })
  }

  const handleContinuousToggle = () => {
    const newValue = !continuousMode
    setContinuousMode(newValue)
    chrome.storage.sync.set({ continuousMode: newValue })
  }

  const handleIntegrationToggle = () => {
    const newValue = !integrationMode
    setIntegrationMode(newValue)
    chrome.storage.sync.set({ integrationMode: newValue })
  }

  const handleSubmit = () => {
    const trimmedQuery = query.trim()
    if (trimmedQuery === "" && images.length === 0) return

    setIsLoading(true)

    const body: {
      query: string
      closePreviousTabs: boolean
      images?: Array<{ name: string; type: string; dataUrl: string }>
    } = {
      query: trimmedQuery || i18n("imagesOnlyPrompt"),
      closePreviousTabs
    }

    if (images.length > 0) {
      body.images = images.map((img) => ({
        name: img.name,
        type: img.type,
        dataUrl: img.dataUrl
      }))
    }

    sendQueryToBackground({
      name: "launchQueries",
      body
    }).catch((error: unknown) => {
      console.error("Error sending query to background:", error)
    })

    chrome.storage.local.remove([CACHE_KEY, CACHE_IMAGES_KEY])

    setTimeout(() => {
      window.close()
    }, 150)
  }

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  const enabledCount = Object.values(enabledServices).filter(Boolean).length
  const serviceNames = {
    chatgpt: i18n("serviceNameChatGPT"),
    grok: i18n("serviceNameGrok"), 
    gemini: i18n("serviceNameGemini"),
    perplexity: i18n("serviceNamePerplexity"),
    claude: i18n("serviceNameClaude")
  }

  const isFormEmpty = query.trim() === "" && images.length === 0

  return (
    <div
      className="w-[360px] bg-background text-foreground select-none font-sans text-xs antialiased"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files)
            e.target.value = ""
          }
        }}
      />

      {/* Header */}
      <div className="px-4.5 pt-4 pb-3 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <img
            src={iconUrl}
            alt="10x Chat"
            className="w-7 h-7 rounded-lg shadow-2xs border border-border/60 object-cover"
          />
          <div>
            <h1 className="text-xs font-semibold tracking-tight text-foreground leading-none">
              {i18n("appTitle")}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              {i18n("appSubtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenOptions}
          className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 flex items-center justify-center transition-colors"
          title={i18n("settings")}
        >
          <GearSix className="w-4 h-4" weight="bold" />
        </button>
      </div>

      {/* Service badges */}
      <div className="px-4.5 py-2.5 bg-muted/20 border-b border-border/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {i18nCount("servicesActive", enabledCount)}
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {enabledCount}/5
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(enabledServices)
            .filter(([_, enabled]) => enabled)
            .map(([service]) => (
              <span
                key={service}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/90 bg-background px-2 py-0.5 rounded-md border border-border/60 shadow-2xs"
              >
                <span className="text-[10px] opacity-75">{SERVICE_ICONS[service]}</span>
                {serviceNames[service as keyof typeof serviceNames]}
              </span>
            ))}
        </div>
      </div>

      {/* Input zone */}
      <div className="px-4.5 pt-3 pb-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {i18n("yourQuestions")}
          </Label>
          {(!isFormEmpty) && (
            <button
              onClick={handleReset}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1 text-[10px]"
              title={i18n("clearQuery")}
            >
              <X className="h-3 w-3" weight="bold" />
            </button>
          )}
        </div>

        <div className="relative rounded-xl border border-border/80 focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-foreground/15 transition-all bg-muted/15 overflow-hidden">
          {/* Drag & drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 bg-background/90 border-2 border-dashed border-primary rounded-xl flex flex-col items-center justify-center gap-1.5 text-center p-4 backdrop-blur-[2px]">
              <ImageIcon className="w-6 h-6 text-primary animate-bounce" weight="duotone" />
              <span className="text-xs font-semibold text-foreground">{i18n("dropImagesTitle")}</span>
              <span className="text-[10px] text-muted-foreground">{i18n("dropImagesHint")}</span>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={query}
            onChange={handleQueryChange}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isLoading) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={i18n("submitShortcut", [submitKeyHint])}
            rows={3}
            className="w-full resize-none border-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/45 focus-visible:ring-0 p-3 leading-relaxed"
            disabled={isLoading}
          />

          {/* Bottom input toolbar */}
          <div className="px-2.5 py-1.5 border-t border-border/40 bg-background/50 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                title={i18n("attachImagesTooltip")}
              >
                <Paperclip className="w-3.5 h-3.5" weight="bold" />
                <span>{i18n("attachImages")}</span>
                {images.length > 0 && (
                  <span className="ml-0.5 px-1 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
                    {images.length}
                  </span>
                )}
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {submitKeyHint}
            </span>
          </div>
        </div>

        {notice && (
          <p
            role="status"
            className="mt-1.5 text-[10px] text-destructive leading-snug"
          >
            {notice}
          </p>
        )}

        {/* Attached image preview chips */}
        {images.length > 0 && (
          <div className="mt-2 pt-1 border-t border-border/30">
            <div className="flex items-center justify-between mb-1.5 text-[10px] text-muted-foreground">
              <span className="font-medium">{i18nCount("attachedImages", images.length)}</span>
              <button
                type="button"
                onClick={handleClearImages}
                className="hover:text-destructive transition-colors flex items-center gap-0.5 text-[10px]"
              >
                <Trash className="w-2.5 h-2.5" />
                {i18n("clearImages")}
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative group shrink-0 w-11 h-11 rounded-lg overflow-hidden border border-border/70 bg-muted/40 shadow-2xs"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    title={i18n("removeImage", [img.name])}
                  >
                    <X className="w-3.5 h-3.5" weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="px-4.5 pb-2.5 space-y-1">
        <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
          <Checkbox
            id="closePreviousTabs"
            checked={closePreviousTabs}
            onCheckedChange={handleCloseTabsToggle}
            className="border-border data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=checked]:text-background"
          />
          <div className="flex items-center gap-2">
            <X className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" weight="bold" />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              {i18n("closePreviousTabs")}
            </span>
          </div>
        </label>

        <label className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
          <Checkbox
            id="continuousMode"
            checked={continuousMode}
            onCheckedChange={handleContinuousToggle}
            className="mt-0.5 border-border data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=checked]:text-background"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ArrowsClockwise className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" weight="bold" />
              <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                {i18n("continuousModeLabel")}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 ml-[22px]">
              {i18n("continuousModeDescription")}
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
          <Checkbox
            id="integrationMode"
            checked={integrationMode}
            onCheckedChange={handleIntegrationToggle}
            className="mt-0.5 border-border data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=checked]:text-background"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ListChecks className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" weight="bold" />
              <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                {i18n("integrationModeLabel")}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 ml-[22px]">
              {i18n("integrationModeDescription")}
            </p>
          </div>
        </label>
      </div>

      {/* Submit button */}
      <div className="px-4.5 pb-4 pt-1">
        <Button
          data-testid="submit-button"
          onClick={handleSubmit}
          disabled={isFormEmpty || isLoading || enabledCount === 0}
          className="w-full h-9 bg-foreground hover:bg-foreground/90 text-background font-medium rounded-lg transition-all shadow-xs disabled:opacity-30 flex items-center justify-center gap-2 text-xs"
        >
          {isLoading ? (
            <>
              <SpinnerGap className="h-3.5 w-3.5 animate-spin" weight="bold" />
              {i18n("launching")}
            </>
          ) : (
            <>
              <RocketLaunch className="h-3.5 w-3.5" weight="duotone" />
              {images.length > 0
                ? i18nCount("submitWithImages", images.length)
                : i18n("submit")}
              <span className="ml-auto text-[10px] text-background/60 font-mono">
                {submitKeyHint}
              </span>
            </>
          )}
        </Button>

        {enabledCount === 0 && (
          <p className="text-[11px] text-destructive text-center mt-2">
            {i18n("noServicesEnabled")}{" "}
            <button
              type="button"
              onClick={handleOpenOptions}
              className="underline hover:text-destructive/80 transition-colors font-medium"
            >
              {i18n("enableServices")}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

export default IndexPopup
