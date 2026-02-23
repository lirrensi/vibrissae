<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { ChatMessage } from '@/composables/useChat'

const props = defineProps<{
  messages: ChatMessage[]
  isOpen: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  toggle: []
}>()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

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
  <!-- Toggle button -->
  <button
    data-testid="chat-toggle"
    @click="emit('toggle')"
    class="fixed bottom-24 right-4 p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors z-10"
    title="Toggle chat"
  >
    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
    </svg>
  </button>
  
  <!-- Chat panel -->
  <div
    v-if="isOpen"
    class="fixed right-4 bottom-40 w-80 h-96 bg-gray-800 rounded-lg shadow-xl flex flex-col z-20"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-gray-700">
      <span class="font-semibold">Chat</span>
      <button @click="emit('toggle')" class="text-gray-400 hover:text-white">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    
    <!-- Messages -->
    <div ref="messagesContainer" data-testid="chat-messages" class="flex-1 overflow-y-auto p-3 space-y-2">
      <div v-if="messages.length === 0" class="text-center text-gray-500 text-sm mt-8">
        No messages yet
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
        {{ msg.text }}
      </div>
    </div>
    
    <!-- Input -->
    <div class="p-3 border-t border-gray-700">
      <form @submit.prevent="send" class="flex gap-2">
        <input
          v-model="inputText"
          data-testid="chat-input"
          type="text"
          placeholder="Type a message..."
          class="flex-1 bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          data-testid="chat-send"
          class="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  </div>
</template>
