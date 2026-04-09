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
  <div class="setup-page">
    <!-- Background decoration -->
    <div class="setup-page__bg">
      <div class="setup-page__orb setup-page__orb--1" />
      <div class="setup-page__orb setup-page__orb--2" />
    </div>

    <div class="setup-card animate-fadeIn">
      <!-- Logo -->
      <div class="setup-card__header">
        <div class="setup-card__logo">📌</div>
        <h1 class="setup-card__title">欢迎使用 OnePlace</h1>
        <p class="setup-card__subtitle">首次使用，请设置访问密码</p>
      </div>

      <!-- Form -->
      <n-form @submit.prevent="handleSetup" class="setup-card__form">
        <div class="setup-card__field">
          <label class="setup-card__label">设置密码</label>
          <n-input
            v-model:value="password"
            type="password"
            placeholder="至少6位密码"
            size="large"
            :disabled="loading"
          />
        </div>

        <div class="setup-card__field">
          <label class="setup-card__label">确认密码</label>
          <n-input
            v-model:value="confirmPassword"
            type="password"
            placeholder="再次输入密码"
            size="large"
            :disabled="loading"
            @keyup.enter="handleSetup"
          />
        </div>

        <n-alert v-if="error" type="error" class="setup-card__error">
          {{ error }}
        </n-alert>

        <n-button
          type="primary"
          size="large"
          block
          :loading="loading"
          class="setup-card__submit"
          @click="handleSetup"
        >
          设置密码并进入
        </n-button>
      </n-form>
    </div>
  </div>
</template>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%);
  position: relative;
  overflow: hidden;
  padding: 24px;
}

.dark .setup-page {
  background: linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #292524 100%);
}

.setup-page__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.setup-page__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.setup-page__orb--1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%);
  top: -100px;
  right: -100px;
}

.setup-page__orb--2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(251, 146, 60, 0.2) 0%, transparent 70%);
  bottom: -50px;
  left: -50px;
}

.setup-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 251, 235, 0.95);
  backdrop-filter: blur(20px);
  border-radius: var(--radius-xl);
  border: 1px solid rgba(251, 191, 36, 0.3);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1), 0 4px 20px rgba(251, 191, 36, 0.15);
  padding: 40px 36px;
  position: relative;
  z-index: 1;
}

.dark .setup-card {
  background: rgba(41, 37, 36, 0.9);
  border-color: rgba(251, 191, 36, 0.15);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 4px 20px rgba(251, 191, 36, 0.1);
}

.setup-card__header {
  text-align: center;
  margin-bottom: 32px;
}

.setup-card__logo {
  font-size: 3rem;
  margin-bottom: 12px;
  display: block;
}

.setup-card__title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #1c1917;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.dark .setup-card__title {
  color: #fafaf9;
}

.setup-card__subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.setup-card__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setup-card__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setup-card__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.setup-card__error {
  border-radius: var(--radius-sm);
}

.setup-card__submit {
  margin-top: 8px;
  height: 44px;
  font-size: 1rem;
  font-weight: 600;
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
  transition: all 0.2s ease;
}

.setup-card__submit:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.45);
  transform: translateY(-1px);
}
</style>
