<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { darkTheme, lightTheme } from 'naive-ui'

const settingsStore = useSettingsStore()

onMounted(() => { settingsStore.loadSettings() })

const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
mediaQuery.addEventListener('change', (e) => { systemDark.value = e.matches })

const isDark = computed(() => {
  if (settingsStore.theme === 'dark') return true
  if (settingsStore.theme === 'light') return false
  return systemDark.value
})

const naiveTheme = computed(() => isDark.value ? darkTheme : lightTheme)

watch(isDark, (val) => {
  document.documentElement.classList.toggle('dark', val)
}, { immediate: true })
</script>

<template>
  <n-config-provider :theme="naiveTheme">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
