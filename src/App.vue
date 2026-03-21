<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { darkTheme, lightTheme } from 'naive-ui'

const settingsStore = useSettingsStore()

const naiveTheme = computed(() => {
  if (settingsStore.theme === 'dark') return darkTheme
  if (settingsStore.theme === 'light') return lightTheme
  return null // system
})
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
