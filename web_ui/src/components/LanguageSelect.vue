<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supportedLocales, setLocale, type SupportedLocale } from '@/locales'

const { locale } = useI18n()
const isOpen = ref(false)

function select(code: SupportedLocale) {
  setLocale(code)
  isOpen.value = false
}

function toggle() {
  isOpen.value = !isOpen.value
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.language-select')) {
    isOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="language-select relative">
    <button
      @click.stop="toggle"
      class="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
      :title="$t('settings.language')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    </button>
    
    <div
      v-if="isOpen"
      class="absolute right-0 top-full mt-2 bg-gray-800 rounded-lg shadow-lg overflow-hidden min-w-36 z-50"
    >
      <button
        v-for="lang in supportedLocales"
        :key="lang.code"
        @click="select(lang.code)"
        :class="[
          'w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors',
          locale === lang.code ? 'text-blue-400' : 'text-gray-300'
        ]"
      >
        {{ lang.name }}
      </button>
    </div>
  </div>
</template>