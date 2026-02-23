<script setup lang="ts">
import { useRouter } from 'vue-router'
import { generateUUID } from '@/utils/uuid'

const router = useRouter()

function generateLink() {
  const roomId = generateUUID()
  router.push(`/room/${roomId}`)
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="text-center max-w-md">
      <h1 class="text-4xl font-bold mb-4">VideoChat</h1>
      <p class="text-gray-400 mb-8">
        No accounts. No downloads. Just open a link and you're connected.
      </p>
      
      <button
        @click="generateLink"
        class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg transition-colors"
      >
        Generate Link
      </button>
      
      <p class="text-gray-500 text-sm mt-6">
        Self-hosted, ephemeral, private
      </p>
    </div>
  </div>
</template>
