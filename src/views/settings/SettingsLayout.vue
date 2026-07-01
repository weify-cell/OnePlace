<script setup lang="ts">
import AppLayout from '@/components/common/AppLayout.vue'

defineProps<{
  title: string
  saving?: boolean
}>()

const emit = defineEmits<{
  save: []
}>()
</script>

<template>
  <AppLayout>
    <div class="settings-page">
      <div class="settings-page__bg" />
      <div class="settings-content">
        <div class="settings-header animate-slideIn">
          <h1 class="settings-header__title">{{ title }}</h1>
          <n-button
            v-if="saving !== undefined"
            type="primary"
            :loading="saving"
            class="settings-header__btn"
            @click="emit('save')"
          >
            保存设置
          </n-button>
        </div>
        <slot />
      </div>
    </div>
  </AppLayout>
</template>

<style scoped src="./settings.css"></style>
