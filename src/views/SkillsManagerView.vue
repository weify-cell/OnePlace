<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import { api } from '@/api'

interface SkillConfig {
  id: number
  name: string
  path: string
  enabled: number
}

const message = useMessage()
const dialog = useDialog()
const skills = ref<SkillConfig[]>([])
const loading = ref(false)
const showModal = ref(false)
const showEditor = ref(false)
const editing = ref<SkillConfig | null>(null)
const form = ref({ name: '', path: '', enabled: 1 })
const fileContent = ref('')
const editorLoading = ref(false)

const columns = [
  { title: '名称', key: 'name', width: 140 },
  { title: '文件路径', key: 'path', width: 180 },
  {
    title: '启用', key: 'enabled', width: 80,
    render: (row: SkillConfig) => h('span', { style: { color: row.enabled ? '#18a058' : '#999' } }, row.enabled ? '已启用' : '已禁用'),
  },
  {
    title: '操作', key: 'actions', width: 200,
    render: (row: SkillConfig) =>
      h('div', { style: { display: 'flex', gap: '8px' } }, [
        h('n-button', { size: 'small', quaternary: true, onClick: () => openEditor(row) }, { default: () => '编辑文件' }),
        h('n-button', { size: 'small', quaternary: true, onClick: () => editSkill(row) }, { default: () => '设置' }),
        h('n-button', { size: 'small', quaternary: true, type: 'error', onClick: () => removeSkill(row) }, { default: () => '删除' }),
      ]),
  },
]

async function fetchSkills() {
  loading.value = true
  try {
    const { data } = await api.get('/skill-config/list')
    skills.value = data
  } catch {
    message.error('加载技能列表失败')
  }
  loading.value = false
}

function openCreate() {
  editing.value = null
  form.value = { name: '', path: '', enabled: 1 }
  showModal.value = true
}

function editSkill(skill: SkillConfig) {
  editing.value = skill
  form.value = { ...skill }
  showModal.value = true
}

async function openEditor(skill: SkillConfig) {
  editorLoading.value = true
  showEditor.value = true
  editing.value = skill
  try {
    const { data } = await api.get(`/skill-config/${skill.id}/file`)
    fileContent.value = data.content || ''
  } catch {
    fileContent.value = ''
  }
  editorLoading.value = false
}

async function saveFile() {
  if (!editing.value) return
  try {
    await api.put(`/skill-config/${editing.value.id}/file`, { content: fileContent.value })
    message.success('文件已保存')
    showEditor.value = false
  } catch {
    message.error('保存文件失败')
  }
}

async function saveSkill() {
  if (!form.value.name) { message.warning('名称不能为空'); return }
  try {
    if (editing.value) {
      await api.put(`/skill-config/${editing.value.id}`, form.value)
      message.success('更新成功')
    } else {
      await api.post('/skill-config', form.value)
      message.success('创建成功')
    }
    showModal.value = false
    await fetchSkills()
  } catch {
    message.error('保存失败')
  }
}

function removeSkill(skill: SkillConfig) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除技能「${skill.name}」吗？（会同时删除文件）`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.delete(`/skill-config/${skill.id}`)
        message.success('已删除')
        await fetchSkills()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

onMounted(fetchSkills)
</script>

<template>
  <AppLayout>
    <div class="page">
      <div class="page__header">
        <div>
          <h1 class="page__title">技能管理</h1>
          <p class="page__sub">管理 Skills 文件，注入到 System Prompt 中增强 Agent 能力</p>
        </div>
        <n-button type="primary" @click="openCreate">
          <template #icon><span>+</span></template>
          新建技能
        </n-button>
      </div>

      <n-card :bordered="false" class="page__card">
        <n-spin :show="loading">
          <n-data-table :columns="columns" :data="skills" :bordered="false" :single-line="false" size="small" />
        </n-spin>
      </n-card>

      <n-modal
        v-model:show="showModal"
        preset="card"
        :title="editing ? '编辑技能' : '新建技能'"
        style="width:500px"
        :mask-closable="false"
      >
        <n-form label-placement="top">
          <n-form-item label="名称" required>
            <n-input v-model:value="form.name" placeholder="技能名称" />
          </n-form-item>
          <n-form-item label="文件路径" required>
            <n-input v-model:value="form.path" placeholder="如 guide.md" />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" @click="saveSkill">保存</n-button>
          </n-space>
        </template>
      </n-modal>

      <n-modal
        v-model:show="showEditor"
        preset="card"
        title="编辑技能文件"
        style="width:800px"
        :mask-closable="false"
      >
        <n-spin :show="editorLoading">
          <n-input
            type="textarea"
            v-model:value="fileContent"
            :rows="22"
            placeholder="编写 Markdown 技能文件..."
            style="font-family: monospace"
          />
        </n-spin>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showEditor = false">取消</n-button>
            <n-button type="primary" @click="saveFile">保存文件</n-button>
          </n-space>
        </template>
      </n-modal>
    </div>
  </AppLayout>
</template>

<style scoped>
.page {
  padding: 32px 28px;
  max-width: 1100px;
  margin: 0 auto;
}
.page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page__title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
.page__sub {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 4px 0 0;
}
.page__card {
  border-radius: 12px;
}
</style>
