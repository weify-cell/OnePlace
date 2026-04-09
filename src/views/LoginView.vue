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
  <div class="login-page">
    <!-- Background decoration -->
    <div class="login-page__bg">
      <div class="login-page__orb login-page__orb--1" />
      <div class="login-page__orb login-page__orb--2" />
    </div>

    <div class="login-card animate-fadeIn">
      <!-- Logo -->
      <div class="login-card__header">
        <div class="login-card__logo">📌</div>
        <h1 class="login-card__title">OnePlace</h1>
        <p class="login-card__subtitle">个人效率工具</p>
      </div>

      <!-- Form -->
      <n-form @submit.prevent="handleLogin" class="login-card__form">
        <div class="login-card__field">
          <label class="login-card__label">访问密码</label>
          <n-input
            v-model:value="password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </div>

        <n-alert v-if="authStore.loginError" type="error" class="login-card__error">
          {{ authStore.loginError }}
        </n-alert>

        <n-button
          type="primary"
          size="large"
          block
          :loading="loading"
          class="login-card__submit"
          @click="handleLogin"
        >
          登录
        </n-button>
      </n-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%);
  position: relative;
  overflow: hidden;
  padding: 24px;
}

.dark .login-page {
  background: linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #292524 100%);
}

/* Background orbs */
.login-page__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.login-page__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.login-page__orb--1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%);
  top: -100px;
  right: -100px;
}

.login-page__orb--2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(251, 146, 60, 0.2) 0%, transparent 70%);
  bottom: -50px;
  left: -50px;
}

/* Card */
.login-card {
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

.dark .login-card {
  background: rgba(41, 37, 36, 0.9);
  border-color: rgba(251, 191, 36, 0.15);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 4px 20px rgba(251, 191, 36, 0.1);
}

/* Header */
.login-card__header {
  text-align: center;
  margin-bottom: 32px;
}

.login-card__logo {
  font-size: 3rem;
  margin-bottom: 12px;
  display: block;
}

.login-card__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1c1917;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.dark .login-card__title {
  color: #fafaf9;
}

.login-card__subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
}

/* Form */
.login-card__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-card__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-card__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.login-card__error {
  border-radius: var(--radius-sm);
}

.login-card__submit {
  margin-top: 8px;
  height: 44px;
  font-size: 1rem;
  font-weight: 600;
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
  transition: all 0.2s ease;
}

.login-card__submit:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.45);
  transform: translateY(-1px);
}
</style>
