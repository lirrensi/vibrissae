import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface LogEntry {
  id: number
  timestamp: Date
  category: 'signaling' | 'webrtc' | 'ice' | 'datachannel' | 'system' | 'roomview' | 'transport'
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

export const useLogStore = defineStore('log', () => {
  const entries = ref<LogEntry[]>([])
  let idCounter = 0

  function log(
    category: LogEntry['category'],
    level: LogEntry['level'],
    message: string,
    data?: Record<string, unknown>
  ) {
    entries.value.push({
      id: ++idCounter,
      timestamp: new Date(),
      category,
      level,
      message,
      data
    })
    // Keep last 200 entries
    if (entries.value.length > 200) {
      entries.value.shift()
    }
  }

  function info(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'info', message, data)
  }

  function warn(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'warn', message, data)
  }

  function error(category: LogEntry['category'], message: string, data?: Record<string, unknown>) {
    log(category, 'error', message, data)
  }

  function clear() {
    entries.value = []
  }

  return { entries, log, info, warn, error, clear }
})
