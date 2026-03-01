<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { generateUUID } from '@/utils/uuid'
import LanguageSelect from '@/components/LanguageSelect.vue'

const { t } = useI18n()
const router = useRouter()
const generatedLink = ref<string | null>(null)
const copied = ref(false)

function generateLink() {
  const roomId = generateUUID()
  generatedLink.value = window.location.origin + '/#/room/' + roomId
}

function copyLink() {
  if (generatedLink.value) {
    navigator.clipboard.writeText(generatedLink.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function joinRoom() {
  if (generatedLink.value) {
    router.push(generatedLink.value.replace(window.location.origin + '/#', ''))
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4">
    <!-- Language selector in top right -->
    <div class="absolute top-4 right-4">
      <LanguageSelect />
    </div>
    
    <div class="text-center max-w-md">
      <h1 class="text-4xl font-bold mb-4">{{ t('app.title') }}</h1>
      <p class="text-gray-400 mb-8">
        {{ t('app.tagline') }}
      </p>
      
      <div v-if="!generatedLink">
        <button
          @click="generateLink"
          class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg transition-colors"
        >
          {{ t('home.generateLink') }}
        </button>
      </div>
      
      <div v-else class="space-y-4">
        <div class="bg-gray-800 rounded-lg p-4">
          <p class="text-sm text-gray-400 mb-2">{{ t('home.shareLink') }}</p>
          <div class="flex items-center gap-2">
            <input 
              type="text" 
              :value="generatedLink" 
              readonly
              class="flex-1 bg-gray-900 text-gray-200 px-3 py-2 rounded text-sm break-all"
            />
            <button
              @click="copyLink"
              class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm whitespace-nowrap"
            >
              {{ copied ? t('home.copied') : t('home.copy') }}
            </button>
          </div>
        </div>
        
        <div class="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 text-sm text-yellow-200">
          <strong>{{ t('home.warning') }}</strong>
        </div>
        
        <button
          @click="joinRoom"
          class="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg text-lg transition-colors w-full"
        >
          {{ t('home.joinThisRoom') }}
        </button>
        
        <button
          @click="generatedLink = null"
          class="text-gray-500 hover:text-gray-400 text-sm"
        >
          {{ t('home.generateNew') }}
        </button>
      </div>
      
      <p class="text-gray-500 text-sm mt-6">
        {{ t('app.footer') }}
      </p>
    </div>
  </div>
</template>