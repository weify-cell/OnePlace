<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { darkTheme, lightTheme } from 'naive-ui'

const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const route = useRoute()

function shouldLoadSettings(): boolean {
  // 未认证时不加载设置
  if (!authStore.token) return false
  return route.path !== '/login' && route.path !== '/setup'
}

onMounted(() => {
  if (shouldLoadSettings()) {
    settingsStore.loadSettings()
  }
})

// 路由切换后加载设置（登录后）
watch(() => route.path, () => {
  if (shouldLoadSettings()) {
    settingsStore.loadSettings()
  }
})

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
