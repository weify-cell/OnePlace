<script setup lang="ts">
defineProps<{
  name: string
  description: string
  icon: string
  status?: 'available' | 'coming-soon'
}>()
</script>

<template>
  <div
    class="tool-card group"
    :class="{ 'cursor-pointer': status === 'available', 'opacity-60': status === 'coming-soon' }"
  >
    <div class="tool-icon">{{ icon }}</div>
    <div class="tool-name">{{ name }}</div>
    <div class="tool-desc">{{ description }}</div>
    <div
      v-if="status === 'coming-soon'"
      class="mt-3 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
    >
      即将推出
    </div>
    <div
      v-else-if="status === 'available'"
      class="mt-3 px-2 py-1 text-xs rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
    >
      已上线
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.tool-card:hover:not(.opacity-60) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: var(--n-primary-color);
}

.tool-icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 12px;
}

.tool-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
  margin-bottom: 4px;
}

.tool-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  text-align: center;
}
</style>
