<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import type { Todo, TodoPriority, TodoStatus, TodoType } from '@/types'
import { TODO_PRIORITY_LABELS, TODO_STATUS_LABELS, TODO_TYPE_LABELS } from '@/types'
import TagInput from '@/components/common/TagInput.vue'

const props = defineProps<{ show: boolean; todo: Todo }>()
const emit = defineEmits<{
  'update:show': [show: boolean]
  'saved': [updated: Todo]
}>()

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

watch(
  () => props.todo,
  (todo) => {
    if (!todo) return
    form.value = {
      title: todo.title,
      description: todo.description ?? '',
      priority: todo.priority,
      status: todo.status,
      type: todo.type,
      due_date: todo.due_date,
      tags: [...todo.tags]
    }
  },
  { immediate: true }
)

const priorityOptions = Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
const statusOptions = Object.entries(TODO_STATUS_LABELS).map(([value, label]) => ({ label, value }))
const typeOptions = [
  { label: '无类型', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]

const saving = ref(false)

async function handleSave() {
  if (!form.value.title.trim()) {
    message.error('请输入标题')
    return
  }
  saving.value = true
  try {
    const updatedTodo = await todoStore.updateTodo(props.todo.id, {
      title: form.value.title.trim(),
      description: form.value.description || null,
      priority: form.value.priority,
      status: form.value.status,
      type: form.value.type,
      due_date: form.value.due_date,
      tags: form.value.tags
    })
    await todoStore.fetchAllTags()
    message.success('保存成功')
    emit('saved', updatedTodo)
    emit('update:show', false)
  } catch {
    message.error('保存失败')
    await todoStore.fetchTodos()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="编辑待办事项"
    class="max-w-lg"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="top">
      <n-form-item label="标题 *">
        <n-input v-model:value="form.title" placeholder="待办标题" @keyup.enter="handleSave" />
      </n-form-item>
      <n-form-item label="描述">
        <n-input v-model:value="form.description" type="textarea" placeholder="可选描述" :rows="2" />
      </n-form-item>
      <div class="grid grid-cols-2 gap-4">
        <n-form-item label="优先级">
          <n-select v-model:value="form.priority" :options="priorityOptions" placeholder="请选择优先级" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select v-model:value="form.status" :options="statusOptions" placeholder="请选择状态" />
        </n-form-item>
      </div>
      <n-form-item label="类型">
        <n-select v-model:value="form.type" :options="typeOptions" placeholder="请选择类型" />
      </n-form-item>
      <n-form-item label="截止日期">
        <n-date-picker v-model:formatted-value="form.due_date" type="date" value-format="yyyy-MM-dd" placeholder="请选择截止日期" clearable class="w-full" />
      </n-form-item>
      <n-form-item label="标签">
        <TagInput :tags="form.tags" @update:tags="form.tags = $event" />
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>
