<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useILinkStore } from '@/stores/ilink.store'
import SettingsLayout from './SettingsLayout.vue'

const settingsStore = useSettingsStore()
const ilinkStore = useILinkStore()
const message = useMessage()
const activeTab = ref('basic')

const ilinkConfig = ref({
  provider: 'qwen',
  model: 'qwen-turbo',
  system_prompt: '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。',
  max_tool_rounds: 5,
  proactive_user_message: '请生成一条主动问候消息',
  proactive_system_prompt: '你是一个友好的微信助手，请主动找用户聊天。语气亲切随意，控制在1-2句话。',
  learning_prompt: '你是一个学习导师，正在帮助用户学习「{topic}」。请按以下方式教学：1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料 2. 以问答方式测试用户对知识点的掌握 3. 根据用户的回答给予反馈和补充解释 4. 控制每次提问1-2个问题，不要连续轰炸 5. 用户答对时鼓励，答错时耐心纠正 6. 如果笔记中没有相关内容，诚实告知并给出通用知识'
})

const ilinkProviderModels = computed(() => {
  const p = settingsStore.availableProviders.find(p => p.name === ilinkConfig.value.provider)
  return p?.models.map(m => ({ label: m.name, value: m.id })) || []
})

let statusPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await settingsStore.loadSettings()
  await ilinkStore.fetchConfig()
  await ilinkStore.fetchStatus()
  if (ilinkStore.config) {
    ilinkConfig.value = {
      provider: ilinkStore.config.provider || 'qwen',
      model: ilinkStore.config.model || 'qwen-turbo',
      system_prompt: ilinkStore.config.system_prompt || '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。',
      max_tool_rounds: ilinkStore.config.max_tool_rounds || 5,
      proactive_user_message: ilinkStore.config.proactive_user_message || '请生成一条主动问候消息',
      proactive_system_prompt: ilinkStore.config.proactive_system_prompt || '你是一个友好的微信助手，请主动找用户聊天。',
      learning_prompt: ilinkStore.config.learning_prompt || '你是一个学习导师，正在帮助用户学习「{topic}」...'
    }
  }
})

onUnmounted(() => {
  stopStatusPolling()
})

async function saveILinkConfig() {
  try {
    await ilinkStore.updateConfig(ilinkConfig.value)
    message.success('Bot 配置已保存')
  } catch (err: any) {
    message.error('保存失败: ' + (err.message || '未知错误'))
  }
}

async function handleStartBot() {
  try {
    const result = await ilinkStore.startBot()
    if (result.success) {
      message.success('Bot 已启动，请查看控制台获取二维码')
      startStatusPolling()
    } else {
      message.error('启动失败: ' + result.error)
    }
  } catch (err: any) {
    message.error('启动失败: ' + (err.message || '未知错误'))
  }
}

async function handleStopBot() {
  try {
    const result = await ilinkStore.stopBot()
    if (result.success) {
      message.success('Bot 已停止')
      stopStatusPolling()
    } else {
      message.error('停止失败: ' + result.error)
    }
  } catch (err: any) {
    message.error('停止失败: ' + (err.message || '未知错误'))
  }
}

async function handleResetLogin() {
  await ilinkStore.resetLogin()
  message.info('登录状态已重置')
}

function startStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer)
  statusPollTimer = setInterval(async () => {
    await ilinkStore.fetchStatus()
  }, 3000)
}

function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}小时${minutes % 60}分钟`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}
</script>

<template>
  <SettingsLayout title="微信 Bot">
    <!-- Bot 状态卡片（Tab 之上，始终显示） -->
    <div class="settings-section animate-slideIn" style="animation-delay: 50ms">
      <div class="settings-card">
        <div class="settings-card__header">
          <div class="settings-card__icon">💬</div>
          <div>
            <h2 class="settings-card__title">Bot 状态</h2>
            <p class="settings-card__desc">通过微信 iLink 协议提供 AI 对话服务</p>
          </div>
        </div>
        <div class="settings-card__body">
          <div class="settings-field">
            <label class="settings-field__label">运行状态</label>
            <div class="ilink-status">
              <div :class="['status-dot', ilinkStore.status?.running ? 'status-dot--running' : 'status-dot--stopped']" />
              <span>{{ ilinkStore.status?.running ? '运行中' : '已停止' }}</span>
              <span v-if="ilinkStore.status?.running && ilinkStore.status?.uptime" class="status-uptime">
                (已运行 {{ formatUptime(ilinkStore.status.uptime) }})
              </span>
              <span v-if="ilinkStore.status?.messages_processed" class="status-messages">
                · 处理 {{ ilinkStore.status.messages_processed }} 条消息
              </span>
            </div>
            <div v-if="ilinkStore.status?.error" class="status-error">
              {{ ilinkStore.status.error }}
            </div>
          </div>

          <div class="settings-field">
            <div class="ilink-actions">
              <n-button
                v-if="!ilinkStore.status?.running"
                type="primary"
                :loading="ilinkStore.isLoading"
                @click="handleStartBot"
              >
                启动 Bot
              </n-button>
              <n-button
                v-if="ilinkStore.status?.running"
                type="error"
                :loading="ilinkStore.isLoading"
                @click="handleStopBot"
              >
                停止 Bot
              </n-button>
            </div>
          </div>

          <div class="settings-field">
            <label class="settings-field__label">登录状态</label>
            <div class="ilink-login">
              <div v-if="ilinkStore.status?.login.status === 'waiting'" class="ilink-login__qrcode">
                <div class="qrcode-status">
                  <div class="status-dot status-dot--waiting" />
                  <span>等待扫码登录...</span>
                </div>
                <div class="settings-field__hint">请查看服务器控制台获取二维码链接</div>
              </div>
              <div v-else-if="ilinkStore.status?.login.status === 'scanned'">
                <div class="status-dot status-dot--running" />
                <span>已扫码，请在手机上确认登录</span>
              </div>
              <div v-else-if="ilinkStore.status?.login.status === 'confirmed'" class="ilink-login__logged">
                <div class="status-dot status-dot--running" />
                <span>已登录</span>
                <n-button size="small" @click="handleResetLogin">重新登录</n-button>
              </div>
              <div v-else>
                <div class="status-dot status-dot--stopped" />
                <span>未启动</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 配置区域 -->
    <div class="settings-section animate-slideIn" style="animation-delay: 100ms">
      <div class="settings-card">
        <n-tabs v-model:value="activeTab" type="line" animated>
          <!-- 基础配置 -->
          <n-tab-pane name="basic" tab="基础配置">
            <div class="settings-card__body">
              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">AI 提供商</label>
                  <n-select
                    v-model:value="ilinkConfig.provider"
                    :options="settingsStore.availableProviders.map(p => ({ label: p.displayName, value: p.name }))"
                    placeholder="选择提供商"
                  />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">AI 模型</label>
                  <n-select
                    v-model:value="ilinkConfig.model"
                    :options="ilinkProviderModels"
                    :disabled="!ilinkConfig.provider"
                    placeholder="选择模型"
                  />
                </div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">系统提示词</label>
                <n-input
                  v-model:value="ilinkConfig.system_prompt"
                  type="textarea"
                  :rows="3"
                  placeholder="定义 Bot 的角色和行为"
                />
              </div>

              <div class="settings-field">
                <label class="settings-field__label">最大工具调用轮数</label>
                <n-input-number v-model:value="ilinkConfig.max_tool_rounds" :min="1" :max="10" />
                <div class="settings-field__hint">控制 Bot 在一次对话中最多调用工具的次数</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存基础配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>

          <!-- 主动聊天 -->
          <n-tab-pane name="proactive" tab="主动聊天">
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">主动聊天系统提示词</label>
                <n-input
                  v-model:value="ilinkConfig.proactive_system_prompt"
                  type="textarea"
                  :rows="3"
                  placeholder="主动聊天时的 Bot 人设"
                />
                <div class="settings-field__hint">仅用于主动聊天模式，不影响普通对话</div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">主动聊天触发指令</label>
                <n-input
                  v-model:value="ilinkConfig.proactive_user_message"
                  type="textarea"
                  :rows="2"
                  placeholder="主动聊天时发送给 AI 的指令"
                />
                <div class="settings-field__hint">控制主动聊天时 AI 生成的对话风格和内容</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存主动聊天配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>

          <!-- 学习模式 -->
          <n-tab-pane name="learning" tab="学习模式">
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">学习模式提示词</label>
                <n-input
                  v-model:value="ilinkConfig.learning_prompt"
                  type="textarea"
                  :rows="6"
                  placeholder="学习模式的 systemPrompt，使用 {topic} 作为主题占位符"
                />
                <div class="settings-field__hint">用户发送 /学习 主题 时使用，{topic} 会被替换为实际主题</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存学习模式配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </SettingsLayout>
</template>

<style scoped src="./settings.css"></style>
