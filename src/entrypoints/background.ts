import {
  recordIntegrationResponse,
  type ServiceType
} from "../background/integration-session"
import handleLaunchQueries from "../background/messages/launchQueries"

const MANAGED_KEY = "extensionManagedIds"
const SERVICE_TAB_KEY = "serviceTabMap"

type ManagedIds = {
  tabs: number[]
  groups: number[]
}

type ServiceTabMap = Partial<Record<ServiceType, number>>

type IntegrationMessage = {
  type: "AI_RESPONSE_CAPTURED"
  service: ServiceType
  content: string
  sessionId?: string
}

const isIntegrationMessage = (message: unknown): message is IntegrationMessage => {
  if (typeof message !== "object" || message === null) {
    return false
  }
  const candidate = message as Partial<IntegrationMessage>
  return (
    candidate.type === "AI_RESPONSE_CAPTURED" &&
    typeof candidate.service === "string" &&
    typeof candidate.content === "string"
  )
}

export default defineBackground(() => {
  console.log("10x Chat Browser background service worker initialized.")

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.name === "launchQueries") {
      handleLaunchQueries(
        { body: message.body },
        {
          send: (data) => {
            sendResponse(data)
          }
        }
      ).catch((error) => {
        console.error("Background: launchQueries error:", error)
        sendResponse({ status: "error", message: error?.message || String(error) })
      })
      return true
    }

    if (isIntegrationMessage(message)) {
      const { service, content, sessionId } = message
      if (!sessionId || content.trim().length === 0) {
        sendResponse({ ok: false })
        return false
      }
      recordIntegrationResponse(sessionId, service, content)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          console.error("Background: Failed to record integration response", error)
          sendResponse({ ok: false })
        })
      return true
    }

    return false
  })

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const result = await chrome.storage.session.get([MANAGED_KEY, SERVICE_TAB_KEY])
    const managed = (result[MANAGED_KEY] as ManagedIds | undefined) || { tabs: [], groups: [] }
    const serviceMap = (result[SERVICE_TAB_KEY] as ServiceTabMap | undefined) || {}
    const filteredTabs = managed.tabs.filter((id) => id !== tabId)
    const nextMap: ServiceTabMap = {}
    let mapChanged = false
    ;(Object.keys(serviceMap) as ServiceType[]).forEach((service) => {
      const storedId = serviceMap[service]
      if (storedId === undefined) {
        return
      }
      if (storedId === tabId) {
        mapChanged = true
      } else {
        nextMap[service] = storedId
      }
    })
    const tabsChanged = filteredTabs.length !== managed.tabs.length
    if (tabsChanged || mapChanged) {
      await chrome.storage.session.set({
        [MANAGED_KEY]: {
          tabs: filteredTabs,
          groups: managed.groups
        },
        [SERVICE_TAB_KEY]: nextMap
      })
    }
  })
})
