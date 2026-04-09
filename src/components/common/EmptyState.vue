<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string; actionLabel?: string }>()
defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon">{{ icon || '📭' }}</div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <n-button
      v-if="actionLabel"
      type="primary"
      class="empty-state__btn"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </n-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-state__icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.08));
}

.empty-state__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-state__desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 24px;
  max-width: 280px;
}

.empty-state__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.empty-state__btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}
</style>
