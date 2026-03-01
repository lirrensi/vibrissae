<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessage } from '@/composables/useChat'

const { t } = useI18n()

const props = defineProps<{
  messages: ChatMessage[]
  localParticipantId: string | null
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

function getParticipantColor(id: string): string {
  // Generate a consistent color based on participant ID
  const colors = [
    'bg-blue-600', 'bg-green-600', 'bg-purple-600', 
    'bg-pink-600', 'bg-yellow-600', 'bg-indigo-600',
    'bg-red-600', 'bg-teal-600', 'bg-orange-600'
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash = hash & hash
  }
  return colors[Math.abs(hash) % colors.length] ?? 'bg-blue-600'
}

function send() {
  if (!inputText.value.trim()) return
  emit('send', inputText.value.trim())
  inputText.value = ''
}

watch(() => props.messages.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})
</script>

<template>
  <!-- Chat panel (always visible, part of flex layout) -->
  <div class="flex flex-col h-full bg-gray-800 rounded-lg">
    <!-- Header -->
    <div class="flex items-center p-2 border-b border-gray-700">
      <span class="text-sm font-semibold text-gray-300">{{ t('chat.title') }}</span>
    </div>
    
    <!-- Messages -->
    <div ref="messagesContainer" data-testid="chat-messages" class="flex-1 overflow-y-auto p-3 space-y-2">
      <div v-if="messages.length === 0" class="text-center text-gray-500 text-sm mt-8">
        {{ t('chat.noMessages') }}
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="[
          'p-2 rounded-lg text-sm max-w-[80%]',
          msg.isLocal 
            ? 'bg-blue-600 ml-auto' 
            : 'bg-gray-700'
        ]"
      >
        <!-- Sender indicator for remote messages -->
        <div 
          v-if="!msg.isLocal" 
          :class="['text-xs font-medium mb-1 px-1.5 py-0.5 rounded inline-block', getParticipantColor(msg.from)]"
        >
          {{ msg.from.slice(0, 8) }}
        </div>
        <div>{{ msg.text }}</div>
      </div>
    </div>
    
    <!-- Input -->
    <div class="p-3 border-t border-gray-700">
      <form @submit.prevent="send" class="flex gap-2">
        <input
          v-model="inputText"
          data-testid="chat-input"
          type="text"
          :placeholder="t('chat.placeholder')"
          class="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          data-testid="chat-send"
          class="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        >
          {{ t('chat.send') }}
        </button>
      </form>
    </div>
  </div>
</template>
