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
    class="tool-card"
    :class="{ 'tool-card--available': status === 'available', 'tool-card--disabled': status === 'coming-soon' }"
  >
    <div class="tool-card__icon">{{ icon }}</div>
    <div class="tool-card__name">{{ name }}</div>
    <div class="tool-card__desc">{{ description }}</div>
    <div
      v-if="status === 'coming-soon'"
      class="tool-card__badge tool-card__badge--coming"
    >
      即将推出
    </div>
    <div
      v-else-if="status === 'available'"
      class="tool-card__badge tool-card__badge--available"
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
  padding: 20px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  text-align: center;
  transition: all 0.2s ease;
}

.tool-card--available {
  cursor: pointer;
}

.tool-card--available:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: rgba(251, 191, 36, 0.4);
}

.tool-card--disabled {
  opacity: 0.55;
}

.tool-card__icon {
  font-size: 2.25rem;
  line-height: 1;
  margin-bottom: 10px;
}

.tool-card__name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.tool-card__desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.tool-card__badge {
  margin-top: 10px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.6875rem;
  font-weight: 600;
}

.tool-card__badge--available {
  background: rgba(245, 158, 11, 0.1);
  color: var(--accent-primary);
}

.tool-card__badge--coming {
  background: var(--bg-secondary);
  color: var(--text-muted);
}
</style>
