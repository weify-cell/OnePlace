<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import type { Todo, TodoPriority, TodoProgressLog, TodoStatus, TodoTaskKind, TodoType } from '@/types'
import {
  TODO_PRIORITY_LABELS,
  TODO_STATUS_LABELS,
  TODO_TASK_KIND_LABELS,
  TODO_TYPE_LABELS
} from '@/types'
import TagInput from '@/components/common/TagInput.vue'

const props = defineProps<{ show: boolean; todo: Todo }>()
const emit = defineEmits<{
  'update:show': [show: boolean]
  saved: [updated: Todo]
}>()

const todoStore = useTodoStore()
const message = useMessage()

const form = ref({
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

const progressForm = ref({
  progress_percent: null as number | null,
  note: ''
})

const progressLogs = ref<TodoProgressLog[]>([])
const saving = ref(false)
const progressSaving = ref(false)
const progressLoading = ref(false)

watch(
  () => props.todo,
  (todo) => {
    if (!todo) return
    form.value = {
      title: todo.title,
      description: todo.description ?? '',
      priority: todo.priority,
      status: todo.status,
      task_kind: todo.task_kind,
      type: todo.type,
      due_date: todo.due_date,
      reminder_time: todo.reminder_time ?? null,
      reminder_enabled: todo.reminder_enabled ?? true,
      tags: [...todo.tags]
    }
    progressForm.value = {
      progress_percent: todo.progress_percent,
      note: ''
    }
  },
  { immediate: true }
)

watch(
  () => [props.show, props.todo.id, form.value.task_kind] as const,
  async ([show, todoId, taskKind]) => {
    if (!show || !todoId || taskKind !== 'long_term') {
      progressLogs.value = []
      return
    }
    await loadProgressLogs()
  },
  { immediate: true }
)

const priorityOptions = Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
const statusOptions = Object.entries(TODO_STATUS_LABELS).map(([value, label]) => ({ label, value }))
const taskKindOptions = Object.entries(TODO_TASK_KIND_LABELS).map(([value, label]) => ({ label, value }))
const typeOptions = [
  { label: '未分类', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]

async function loadProgressLogs() {
  progressLoading.value = true
  try {
    progressLogs.value = await todoStore.getTodoProgressLogs(props.todo.id, 10)
  } catch {
    progressLogs.value = []
  } finally {
    progressLoading.value = false
  }
}

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
      task_kind: form.value.task_kind,
      type: form.value.type,
      due_date: form.value.due_date,
      reminder_time: form.value.reminder_time,
      reminder_enabled: form.value.reminder_enabled,
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

async function handleUpdateProgress() {
  if (form.value.task_kind !== 'long_term') return
  if (progressForm.value.progress_percent !== null) {
    const value = Number(progressForm.value.progress_percent)
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      message.error('进度必须是 0 到 100 之间的数字')
      return
    }
  }

  const note = progressForm.value.note.trim()
  const unchangedPercent = progressForm.value.progress_percent === props.todo.progress_percent
  if (unchangedPercent && !note) {
    message.error('请填写新的进度或进展说明')
    return
  }

  progressSaving.value = true
  try {
    const updatedTodo = await todoStore.updateTodoProgress(props.todo.id, {
      progress_percent: progressForm.value.progress_percent,
      note: note || undefined
    })
    progressForm.value = {
      progress_percent: updatedTodo.progress_percent,
      note: ''
    }
    await loadProgressLogs()
    message.success('进度已更新')
    emit('saved', updatedTodo)
  } catch (error: any) {
    message.error(error?.response?.data?.error || '更新进度失败')
  } finally {
    progressSaving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="编辑待办事项"
    class="max-w-2xl"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="top">
      <n-form-item label="标题 *">
        <n-input v-model:value="form.title" placeholder="输入待办标题" @keyup.enter="handleSave" />
      </n-form-item>

      <n-form-item label="描述">
        <n-input v-model:value="form.description" type="textarea" placeholder="补充说明" :rows="3" />
      </n-form-item>

      <div class="grid grid-cols-2 gap-4">
        <n-form-item label="状态">
          <n-select v-model:value="form.status" :options="statusOptions" placeholder="选择状态" />
        </n-form-item>
        <n-form-item label="优先级">
          <n-select v-model:value="form.priority" :options="priorityOptions" placeholder="选择优先级" />
        </n-form-item>
      </div>

      <n-form-item label="任务性质">
        <n-radio-group v-model:value="form.task_kind" name="edit-task-kind">
          <n-radio-button
            v-for="option in taskKindOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          >
            {{ option.label }}
          </n-radio-button>
        </n-radio-group>
      </n-form-item>

      <n-form-item label="类型">
        <n-select v-model:value="form.type" :options="typeOptions" placeholder="选择类型" />
      </n-form-item>

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

      <n-form-item label="标签">
        <TagInput :tags="form.tags" @update:tags="form.tags = $event" />
      </n-form-item>
    </n-form>

    <div v-if="form.task_kind === 'long_term'" class="progress-panel">
      <div class="progress-panel__header">
        <div>
          <div class="progress-panel__title">进度管理</div>
          <div class="progress-panel__subtitle">记录当前进度和最近一次推进说明</div>
        </div>
      </div>

      <div class="progress-panel__grid">
        <n-form-item label="当前进度">
          <n-input-number
            v-model:value="progressForm.progress_percent"
            :min="0"
            :max="100"
            placeholder="0 - 100"
            class="w-full"
          />
        </n-form-item>
        <div class="progress-panel__preview">
          <span class="progress-panel__preview-label">预览</span>
          <span class="progress-panel__preview-value">{{ progressForm.progress_percent ?? 0 }}%</span>
        </div>
      </div>

      <n-form-item label="本次进展说明">
        <n-input
          v-model:value="progressForm.note"
          type="textarea"
          placeholder="例如：已完成第六章阅读，并整理了重点摘录"
          :rows="3"
        />
      </n-form-item>

      <div class="progress-panel__actions">
        <n-button type="primary" secondary :loading="progressSaving" @click="handleUpdateProgress">
          记录进展
        </n-button>
      </div>

      <div class="progress-panel__logs">
        <div class="progress-panel__logs-title">最近进展</div>
        <n-spin :show="progressLoading">
          <div v-if="progressLogs.length === 0" class="progress-panel__empty">暂无进展记录</div>
          <div v-else class="progress-panel__log-list">
            <div v-for="log in progressLogs" :key="log.id" class="progress-panel__log-item">
              <div class="progress-panel__log-time">{{ new Date(log.created_at).toLocaleString() }}</div>
              <div class="progress-panel__log-content">{{ log.content }}</div>
            </div>
          </div>
        </n-spin>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.progress-panel {
  margin-top: 20px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 20px;
}

.progress-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.progress-panel__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-panel__subtitle {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.progress-panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 220px) 1fr;
  gap: 16px;
  align-items: end;
}

.progress-panel__preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  min-height: 40px;
}

.progress-panel__preview-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.progress-panel__preview-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.progress-panel__actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.progress-panel__logs {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-secondary);
}

.progress-panel__logs-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.progress-panel__empty {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.progress-panel__log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-panel__log-item {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
}

.progress-panel__log-time {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.progress-panel__log-content {
  font-size: 0.875rem;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
