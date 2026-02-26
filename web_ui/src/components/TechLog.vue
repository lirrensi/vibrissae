<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogStore, type LogEntry } from '@/stores/log'

const logStore = useLogStore()
const { entries } = storeToRefs(logStore)

const container = ref<HTMLElement | null>(null)
const expandedIds = ref<Set<number>>(new Set())

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

function getLevelClass(level: LogEntry['level']): string {
  switch (level) {
    case 'warn': return 'text-yellow-400'
    case 'error': return 'text-red-400'
    default: return 'text-gray-300'
  }
}

function getCategoryBadgeClass(category: LogEntry['category']): string {
  switch (category) {
    case 'signaling': return 'bg-blue-600'
    case 'webrtc': return 'bg-green-600'
    case 'ice': return 'bg-purple-600'
    case 'datachannel': return 'bg-orange-600'
    case 'system': return 'bg-gray-600'
    default: return 'bg-gray-600'
  }
}

function toggleExpand(id: number) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

function clearLog() {
  logStore.clear()
}

// Auto-scroll on new entries
watch(() => entries.value.length, async () => {
  await nextTick()
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight
  }
})
</script>

<template>
  <div class="flex flex-col h-full bg-gray-800 rounded-lg">
    <!-- Header -->
    <div class="flex items-center justify-between p-2 border-b border-gray-700">
      <span class="text-sm font-semibold text-gray-300">Tech Log</span>
      <button 
        @click="clearLog"
        class="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-700"
        title="Clear log"
      >
        Clear
      </button>
    </div>
    
    <!-- Log entries -->
    <div ref="container" class="flex-1 overflow-y-auto p-2 text-xs font-mono space-y-1">
      <div v-if="entries.length === 0" class="text-gray-500 text-center py-4">
        No log entries yet
      </div>
      <div 
        v-for="entry in entries" 
        :key="entry.id"
        class="p-1.5 rounded bg-gray-900/50 hover:bg-gray-900"
      >
        <div class="flex items-start gap-2">
          <span class="text-gray-500 shrink-0">{{ formatTime(entry.timestamp) }}</span>
          <span :class="['px-1.5 py-0.5 rounded text-xs text-white shrink-0', getCategoryBadgeClass(entry.category)]">
            {{ entry.category }}
          </span>
          <span :class="['flex-1', getLevelClass(entry.level)]">{{ entry.message }}</span>
        </div>
        <div v-if="entry.data" class="mt-1">
          <button 
            @click="toggleExpand(entry.id)"
            class="text-gray-500 hover:text-gray-400 underline"
          >
            {{ expandedIds.has(entry.id) ? '▼ Hide' : '▶ Show' }} data
          </button>
          <pre 
            v-if="expandedIds.has(entry.id)"
            class="mt-1 p-2 bg-gray-950 rounded text-gray-400 overflow-x-auto whitespace-pre-wrap"
          >{{ JSON.stringify(entry.data, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
