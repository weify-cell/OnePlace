<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function handleSetup() {
  if (password.value.length < 6) { error.value = '密码至少6位'; return }
  if (password.value !== confirmPassword.value) { error.value = '两次密码不一致'; return }
  loading.value = true
  try {
    await authStore.setupPassword(password.value)
    router.push('/todos')
  } catch (err: unknown) {
    error.value = (err as Error).message || '设置失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="h-screen flex-center bg-gray-50 dark:bg-gray-900">
    <n-card class="w-full max-w-sm" title="欢迎使用 OnePlace">
      <p class="text-gray-500 text-sm mb-4">首次使用，请设置访问密码</p>
      <n-form @submit.prevent="handleSetup">
        <n-form-item label="设置密码">
          <n-input v-model:value="password" type="password" placeholder="至少6位密码" />
        </n-form-item>
        <n-form-item label="确认密码">
          <n-input v-model:value="confirmPassword" type="password" placeholder="再次输入密码" @keyup.enter="handleSetup" />
        </n-form-item>
        <n-alert v-if="error" type="error" class="mb-4">{{ error }}</n-alert>
        <n-button type="primary" block :loading="loading" @click="handleSetup">设置密码并进入</n-button>
      </n-form>
    </n-card>
  </div>
</template>
