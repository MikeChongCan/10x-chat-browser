import React, { useState, useEffect } from "react"
import type { IntegrationSession } from "./background/integration-session"
import { i18n } from "./lib/i18n"
import "./style.css"

interface ServiceConfig {
  chatgpt: boolean
  grok: boolean
  gemini: boolean
  perplexity: boolean
  claude: boolean
}

const getServiceDetails = () => ({
  chatgpt: {
    name: i18n("serviceNameChatGPT"),
    description: i18n("serviceDescChatGPT"),
    icon: "⚡",
    color: "from-green-500 to-emerald-600"
  },
  grok: {
    name: i18n("serviceNameGrok"),
    description: i18n("serviceDescGrok"),
    icon: "𝕏",
    color: "from-gray-800 to-black"
  },
  gemini: {
    name: i18n("serviceNameGoogleGemini"),
    description: i18n("serviceDescGemini"),
    icon: "✦",
    color: "from-blue-500 to-indigo-600"
  },
  perplexity: {
    name: i18n("serviceNamePerplexityAI"),
    description: i18n("serviceDescPerplexity"),
    icon: "🔍",
    color: "from-teal-500 to-cyan-600"
  },
  claude: {
    name: i18n("serviceNameClaude"),
    description: i18n("serviceDescClaude"),
    icon: "◉",
    color: "from-amber-600 to-orange-600"
  }
})

function OptionsPage() {
  const [services, setServices] = useState<ServiceConfig>({
    chatgpt: true,
    grok: true,
    gemini: true,
    perplexity: true,
    claude: true
  })
  const [launchMode, setLaunchMode] = useState<"tabGroup" | "windows" | "tabs">("tabGroup")
  const [useTabGroups, setUseTabGroups] = useState(true)
  const [continuousMode, setContinuousMode] = useState(false)
  const [integrationMode, setIntegrationMode] = useState(false)
  const [sessions, setSessions] = useState<IntegrationSession[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    chrome.storage.sync.get(
      ["enabledServices", "launchMode", "useTabGroups", "continuousMode", "integrationMode"],
      (result) => {
        if (result.enabledServices) {
          setServices(result.enabledServices)
        }
        if (result.launchMode) {
          setLaunchMode(result.launchMode)
        }
        if (result.useTabGroups !== undefined) {
          setUseTabGroups(result.useTabGroups)
        }
        if (typeof result.continuousMode === "boolean") {
          setContinuousMode(result.continuousMode)
        }
        if (typeof result.integrationMode === "boolean") {
          setIntegrationMode(result.integrationMode)
        }
      }
    )
  }, [])

  useEffect(() => {
    chrome.storage.local.get(["integrationSessions"], (result) => {
      const stored = result.integrationSessions as IntegrationSession[] | undefined
      if (stored) {
        setSessions(stored)
      }
    })
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.integrationSessions) {
        const next = changes.integrationSessions.newValue as IntegrationSession[] | undefined
        setSessions(next || [])
      }
    }
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener)
    }
    return () => {
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(listener)
      }
    }
  }, [])

  const handleToggle = (service: keyof ServiceConfig) => {
    setServices((prev) => ({
      ...prev,
      [service]: !prev[service]
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await chrome.storage.sync.set({
        enabledServices: services,
        launchMode: launchMode
      })
      await chrome.storage.sync.set({ useTabGroups: useTabGroups })
      await chrome.storage.sync.set({
        continuousMode: continuousMode,
        integrationMode: integrationMode
      })
      setSaveMessage(i18n("settingsSaved"))
      setTimeout(() => setSaveMessage(""), 3000)
    } catch {
      setSaveMessage(i18n("errorSaving"))
      setTimeout(() => setSaveMessage(""), 3000)
    }
    setIsSaving(false)
  }

  const enabledCount = Object.values(services).filter(Boolean).length
  const serviceDetails = getServiceDetails()
  const latestSession = sessions.length > 0 ? sessions[0] : null
  const latestSummary = latestSession?.summary
  const combinedSummaryText = latestSummary
    ? latestSummary.combined || latestSummary.comparison.flatMap((item) => item.highlights).join(" ")
    : ""
  const lastUpdatedDisplay = latestSession ? new Date(latestSession.updatedAt).toLocaleString() : ""

  return (
    <div className="min-h-screen bg-slate-50/50 text-foreground antialiased font-sans">
      <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2.5 mb-2">
            <div className="w-9 h-9 bg-foreground text-background rounded-xl flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">{i18n("optionsTitle")}</h1>
          </div>
          <p className="text-gray-500 text-xs">{i18n("optionsSubtitle")}</p>
        </div>

        {/* Status Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center shadow-xs">
                <span className="text-white text-xs font-semibold">{enabledCount}</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{i18n("activeServices")}</h3>
                <p className="text-xs text-gray-500">{i18n("activeServicesDesc")}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900">{enabledCount}/5</div>
              <div className="text-xs text-gray-500">{i18n("enabled")}</div>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {(Object.keys(serviceDetails) as Array<keyof ServiceConfig>).map((serviceKey) => {
            const service = serviceDetails[serviceKey]
            const isEnabled = services[serviceKey]

            return (
              <div
                key={serviceKey}
                className={`bg-white rounded-2xl shadow-sm border transition-all duration-200 ${
                  isEnabled
                    ? "border-violet-200 ring-2 ring-violet-100"
                    : "border-gray-200/60 hover:border-gray-300"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 bg-gradient-to-br ${service.color} rounded-xl flex items-center justify-center text-lg text-white shadow-2xs`}>
                        {service.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">{service.name}</h3>
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{service.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${isEnabled ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className={`text-xs font-medium ${isEnabled ? "text-green-700" : "text-gray-500"}`}>
                        {isEnabled ? i18n("serviceEnabled") : i18n("serviceDisabled")}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => handleToggle(serviceKey)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                        isEnabled ? "bg-violet-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                          isEnabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Tab Groups Setting */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-5 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-sm">{i18n("enableTabGroups")}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{i18n("enableTabGroupsDesc")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={useTabGroups}
              onClick={() => setUseTabGroups(!useTabGroups)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                useTabGroups ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  useTabGroups ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Continuous & Integration Modes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-sm">{i18n("continuousModeLabel")}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{i18n("continuousModeDescription")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={continuousMode}
              onClick={() => setContinuousMode(!continuousMode)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                continuousMode ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  continuousMode ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 mt-5 pt-4 border-t border-gray-100">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-sm">{i18n("integrationModeLabel")}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{i18n("integrationModeDescription")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={integrationMode}
              onClick={() => setIntegrationMode(!integrationMode)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                integrationMode ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  integrationMode ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Launch Mode Setting */}
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-200/60 p-5 mb-6 transition-opacity ${
          useTabGroups ? "opacity-100" : "opacity-50 pointer-events-none"
        }`}>
          <h3 className="font-semibold text-gray-900 text-sm mb-1">{i18n("launchMode")}</h3>
          <p className="text-gray-500 text-xs mb-4">{i18n("launchModeDesc")}</p>

          <div className="space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("tabGroupMode")}
                value="tabGroup"
                checked={launchMode === "tabGroup"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className="mt-1 text-violet-600 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-xs">
                  {i18n("tabGroupMode")}{" "}
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full ml-1.5 font-normal">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{i18n("tabGroupModeDesc")}</p>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("windowsMode")}
                value="windows"
                checked={launchMode === "windows"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className="mt-1 text-violet-600 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-xs">{i18n("windowsMode")}</div>
                <p className="text-xs text-gray-500 mt-0.5">{i18n("windowsModeDesc")}</p>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("tabsMode")}
                value="tabs"
                checked={launchMode === "tabs"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className="mt-1 text-violet-600 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 text-xs">{i18n("tabsMode")}</div>
                <p className="text-xs text-gray-500 mt-0.5">{i18n("tabsModeDesc")}</p>
              </div>
            </label>
          </div>
        </div>

        {/* Integration Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-5 mb-8">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">{i18n("integrationSummaryTitle")}</h3>
            {lastUpdatedDisplay && (
              <span className="text-[10px] text-gray-400 font-mono">{lastUpdatedDisplay}</span>
            )}
          </div>
          {latestSession ? (
            <div className="mt-3">
              <p className="text-xs text-gray-700 font-medium">"{latestSession.query}"</p>
              {combinedSummaryText && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-3 leading-relaxed">{combinedSummaryText}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-2">{i18n("integrationSummaryEmpty")}</p>
          )}
        </div>

        {/* Save Button */}
        <div className="text-center space-y-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-foreground hover:bg-foreground/90 disabled:bg-gray-400 text-background font-medium rounded-xl transition-all shadow-xs disabled:cursor-not-allowed flex items-center justify-center space-x-2 mx-auto text-xs"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-background" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{i18n("saving")}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{i18n("saveSettings")}</span>
              </>
            )}
          </button>

          {saveMessage && (
            <div className={`text-xs font-medium ${saveMessage.includes("Error") ? "text-red-600" : "text-green-600"}`}>
              {saveMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptionsPage