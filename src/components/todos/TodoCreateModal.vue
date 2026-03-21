<script setup lang="ts">
import { ref } from 'vue'
import { useTodoStore } from '@/stores/todo.store'
import type { TodoPriority, TodoStatus, TodoType } from '@/types'
import { TODO_PRIORITY_LABELS, TODO_STATUS_LABELS, TODO_TYPE_LABELS } from '@/types'
import TagInput from '@/components/common/TagInput.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const todoStore = useTodoStore()
const message = useMessage()

const form = ref({
  title: '',
  description: '',
  priority: 'medium' as TodoPriority,
  status: 'todo' as TodoStatus,
  type: null as TodoType | null,
  due_date: null as string | null,
  tags: [] as string[]
})

const priorityOptions = Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
const statusOptions = Object.entries(TODO_STATUS_LABELS).map(([value, label]) => ({ label, value }))
const typeOptions = [
  { label: '无类型', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]

async function handleCreate() {
  if (!form.value.title.trim()) { message.error('请输入标题'); return }
  await todoStore.createTodo({ ...form.value, title: form.value.title.trim() })
  message.success('创建成功')
  emit('update:show', false)
  // Reset form
  form.value = { title: '', description: '', priority: 'medium', status: 'todo', type: null, due_date: null, tags: [] }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="新建待办事项"
    class="max-w-lg"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="top">
      <n-form-item label="标题 *">
        <n-input v-model:value="form.title" placeholder="待办标题" @keyup.enter="handleCreate" />
      </n-form-item>
      <n-form-item label="描述">
        <n-input v-model:value="form.description" type="textarea" placeholder="可选描述" :rows="2" />
      </n-form-item>
      <div class="grid grid-cols-2 gap-4">
        <n-form-item label="优先级">
          <n-select v-model:value="form.priority" :options="priorityOptions" />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="form.type" :options="typeOptions" />
        </n-form-item>
      </div>
      <n-form-item label="截止日期">
        <n-date-picker v-model:formatted-value="form.due_date" type="date" value-format="yyyy-MM-dd" clearable class="w-full" />
      </n-form-item>
      <n-form-item label="标签">
        <TagInput :tags="form.tags" @update:tags="form.tags = $event" />
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" @click="handleCreate">创建</n-button>
      </div>
    </template>
  </n-modal>
</template>
