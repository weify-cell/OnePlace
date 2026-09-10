<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTodoStore } from '@/stores/todo.store'
import type { TodoPriority, TodoStatus, TodoTaskKind, TodoType } from '@/types'
import { TODO_PRIORITY_LABELS, TODO_TASK_KIND_LABELS, TODO_TYPE_LABELS } from '@/types'
import TagInput from '@/components/common/TagInput.vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const todoStore = useTodoStore()
const message = useMessage()

const defaultForm = () => ({
  title: '',
  description: '',
  priority: 'medium' as TodoPriority,
  status: 'todo' as TodoStatus,
  task_kind: 'one_time' as TodoTaskKind,
  type: null as TodoType | null,
  due_date: null as string | null,
  reminder_time: null as string | null,
  reminder_enabled: true,
  tags: [] as string[]
})

const form = ref(defaultForm())

const priorityOptions = Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
const typeOptions = [
  { label: '未分类', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]
const taskKindOptions = Object.entries(TODO_TASK_KIND_LABELS).map(([value, label]) => ({ label, value }))

// 任务性质决定提醒行为，页面显式提示（长期每天顺延重复提醒 / 一次性只提醒一次）
const taskKindHint = computed(() =>
  form.value.task_kind === 'long_term'
    ? '长期任务：提醒到点后自动顺延到次日同一时间，每天重复提醒，并可记录进度'
    : '一次性任务：提醒到点后只推送一次，随后自动关闭提醒'
)

async function handleCreate() {
  if (!form.value.title.trim()) {
    message.error('请输入标题')
    return
  }

  await todoStore.createTodo({
    ...form.value,
    title: form.value.title.trim(),
    description: form.value.description || null
  })
  message.success('创建成功')
  emit('update:show', false)
  form.value = defaultForm()
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
        <n-input v-model:value="form.title" placeholder="输入待办标题" @keyup.enter="handleCreate" />
      </n-form-item>

      <n-form-item label="描述">
        <n-input v-model:value="form.description" type="textarea" placeholder="补充说明" :rows="3" />
      </n-form-item>

      <n-form-item label="任务性质">
        <div class="task-kind">
          <n-radio-group v-model:value="form.task_kind" name="task-kind">
            <n-radio-button
              v-for="option in taskKindOptions"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
          <div class="form-hint">{{ taskKindHint }}</div>
        </div>
      </n-form-item>

      <div class="grid grid-cols-2 gap-4">
        <n-form-item label="优先级">
          <n-select v-model:value="form.priority" :options="priorityOptions" placeholder="选择优先级" />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="form.type" :options="typeOptions" placeholder="选择类型" />
        </n-form-item>
      </div>

      <n-form-item label="截止日期">
        <n-date-picker
          v-model:formatted-value="form.due_date"
          type="date"
          value-format="yyyy-MM-dd"
          placeholder="选择截止日期"
          clearable
          class="w-full"
        />
      </n-form-item>

      <div class="grid grid-cols-2 gap-4">
        <n-form-item label="提醒时间">
          <n-date-picker
            v-model:formatted-value="form.reminder_time"
            type="datetime"
            value-format="yyyy-MM-dd HH:mm"
            placeholder="选择提醒时间"
            clearable
            class="w-full"
          />
        </n-form-item>
        <n-form-item label="启用提醒">
          <n-switch v-model:value="form.reminder_enabled" />
        </n-form-item>
      </div>

      <div class="form-hint form-hint--block">需同时填写「提醒时间」并打开「启用提醒」才会生效，到点后通过微信机器人推送。</div>

      <n-form-item label="标签">
        <TagInput :tags="form.tags" @update:tags="form.tags = $event" />
      </n-form-item>
    </n-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" @click="handleCreate">创建</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.task-kind {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.form-hint--block {
  margin: -8px 0 16px;
}
</style>
