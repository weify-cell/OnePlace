<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { darkTheme, lightTheme } from 'naive-ui'
import LoginReminderModal from '@/components/common/LoginReminderModal.vue'

const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const route = useRoute()

function shouldLoadSettings(): boolean {
  // 未认证时不加载设置
  if (!authStore.token) return false
  return route.path !== '/login' && route.path !== '/setup'
}

const showReminderModal = computed(() => {
  return authStore.isAuthenticated && route.path !== '/login' && route.path !== '/setup'
})

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

const naiveThemeOverrides = computed(() => ({
  common: {
    inputColor: isDark.value ? '#292524' : '#fffbeb',
    inputColorDisabled: isDark.value ? '#1c1917' : '#fef3c7',
    actionColor: isDark.value ? '#292524' : '#fffbeb',
  },
  Input: {
    color: isDark.value ? '#292524' : '#fffbeb',
    colorDisabled: isDark.value ? '#1c1917' : '#fef3c7',
    border: '1px solid var(--border-subtle)',
    borderHover: '1px solid var(--accent-primary)',
    borderFocus: '1px solid var(--accent-primary)',
    boxShadowFocus: '0 0 0 2px rgba(245, 158, 11, 0.2)',
  },
  Select: {
    peers: {
      InternalInput: {
        color: isDark.value ? '#292524' : '#fffbeb',
        colorDisabled: isDark.value ? '#1c1917' : '#fef3c7',
      }
    }
  }
}))

watch(isDark, (val) => {
  document.documentElement.classList.toggle('dark', val)
}, { immediate: true })
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides" class="h-full">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view v-slot="{ Component, route }">
            <transition name="fade" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
          <LoginReminderModal v-if="showReminderModal" />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
