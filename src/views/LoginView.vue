<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!password.value) return
  loading.value = true
  try {
    await authStore.login(password.value)
    router.push('/todos')
  } catch { /* error set in store */ } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="h-screen flex-center bg-gray-50 dark:bg-gray-900">
    <n-card class="w-full max-w-sm" title="OnePlace">
      <n-form @submit.prevent="handleLogin">
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            placeholder="请输入密码"
            @keyup.enter="handleLogin"
          />
        </n-form-item>
        <n-alert v-if="authStore.loginError" type="error" class="mb-4">
          {{ authStore.loginError }}
        </n-alert>
        <n-button type="primary" block :loading="loading" @click="handleLogin">
          登录
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>
