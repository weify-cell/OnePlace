<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTodoStore } from '@/stores/todo.store'

const router = useRouter()
const todoStore = useTodoStore()

const showModal = ref(false)
const pendingCount = ref(0)
const urgentCount = ref(0)
const dontRemindToday = ref(false)

onMounted(async () => {
  const today = new Date().toISOString().split('T')[0]
  const lastReminder = localStorage.getItem('todo_reminder_date')

  if (lastReminder !== today) {
    try {
      const [pendingRes, urgentRes] = await Promise.all([
        todoStore.fetchPendingCount(),
        todoStore.fetchUrgentCount()
      ])
      pendingCount.value = pendingRes.count
      urgentCount.value = urgentRes.count
      if (pendingCount.value > 0) {
        showModal.value = true
      }
    } catch {
      // silently fail
    }
  }
})

const handleClose = () => {
  if (dontRemindToday.value) {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem('todo_reminder_date', today)
  }
  showModal.value = false
}

const handleViewTodo = () => {
  handleClose()
  router.push('/todos')
}
</script>

<template>
  <NModal v-model:show="showModal" :mask-closable="false">
    <NCard title="待办提醒" style="width: 400px;">
      <p v-if="urgentCount > 0">你有 <strong>{{ pendingCount }}</strong> 项待办事项，其中 <strong>{{ urgentCount }}</strong> 项即将到期或已逾期</p>
      <p v-else>你有 <strong>{{ pendingCount }}</strong> 项待办事项</p>
      <NCheckbox v-model:checked="dontRemindToday" style="margin-top: 12px;">
        今天不再提醒
      </NCheckbox>
      <template #footer>
        <div style="display: flex; justify-content: space-between;">
          <NButton @click="handleClose">关闭</NButton>
          <NButton type="primary" @click="handleViewTodo">查看待办</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>
