<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import axios from 'axios'

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
const editingSkillId = ref<number | null>(null)

const columns = [
  { title: '名称', key: 'name', width: 150 },
  { title: '文件路径', key: 'path', width: 200 },
  { title: '启用', key: 'enabled', width: 70, render: (row: SkillConfig) => row.enabled ? '✅' : '❌' },
  {
    title: '操作', key: 'actions', width: 180,
    render: (row: SkillConfig) => {
      const { h } = require('vue')
      return h('div', { style: 'display:flex;gap:8px' }, [
        h('n-button', { size: 'small', onClick: () => openEditor(row) }, { default: () => '编辑文件' }),
        h('n-button', { size: 'small', onClick: () => editSkill(row) }, { default: () => '设置' }),
        h('n-button', { size: 'small', type: 'error', onClick: () => removeSkill(row) }, { default: () => '删除' }),
      ])
    },
  },
]

async function fetchSkills() {
  loading.value = true
  const { data } = await axios.get('/api/skill-config/list')
  skills.value = data
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
  editingSkillId.value = skill.id
  editorLoading.value = true
  showEditor.value = true
  try {
    const { data } = await axios.get(`/api/skill-config/${skill.id}/file`)
    fileContent.value = data.content || ''
  } catch {
    fileContent.value = ''
  }
  editorLoading.value = false
}

async function saveFile() {
  if (editingSkillId.value === null) return
  await axios.put(`/api/skill-config/${editingSkillId.value}/file`, { content: fileContent.value })
  message.success('文件已保存')
  showEditor.value = false
}

async function saveSkill() {
  if (!form.value.name) { message.warning('名称不能为空'); return }
  if (editing.value) {
    await axios.put(`/api/skill-config/${editing.value.id}`, form.value)
    message.success('更新成功')
  } else {
    await axios.post('/api/skill-config', form.value)
    message.success('创建成功')
  }
  showModal.value = false
  await fetchSkills()
}

function removeSkill(skill: SkillConfig) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除技能「${skill.name}」吗？（会同时删除文件）`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await axios.delete(`/api/skill-config/${skill.id}`)
      message.success('已删除')
      await fetchSkills()
    },
  })
}

onMounted(fetchSkills)
</script>

<template>
  <AppLayout>
    <div class="page">
      <div class="page-header">
        <h1>技能管理</h1>
        <n-button type="primary" @click="openCreate">新建技能</n-button>
      </div>
      <n-spin :show="loading">
        <n-data-table :columns="columns" :data="skills" :bordered="false" :single-line="false" />
      </n-spin>

      <!-- 设置弹窗 -->
      <n-modal v-model:show="showModal" :title="editing ? '编辑技能' : '新建技能'">
        <n-form label-placement="top">
          <n-form-item label="名称">
            <n-input v-model:value="form.name" placeholder="技能名称" />
          </n-form-item>
          <n-form-item label="文件路径">
            <n-input v-model:value="form.path" placeholder="如 guide.md" />
          </n-form-item>
          <n-form-item label="启用">
            <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
          </n-form-item>
        </n-form>
        <template #action>
          <n-space justify="end">
            <n-button @click="showModal = false">取消</n-button>
            <n-button type="primary" @click="saveSkill">保存</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 文件编辑器弹窗 -->
      <n-modal v-model:show="showEditor" title="编辑技能文件" style="width:800px">
        <n-spin :show="editorLoading">
          <n-input
            type="textarea"
            v-model:value="fileContent"
            :rows="20"
            placeholder="编写 Markdown 技能文件内容..."
          />
        </n-spin>
        <template #action>
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
.page { padding: 32px 28px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h1 { font-size: 1.5rem; font-weight: 700; }
</style>
