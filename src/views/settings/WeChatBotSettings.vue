<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useILinkStore } from '@/stores/ilink.store'
import { resolveBotState } from '@/utils/botState'
import SettingsLayout from './SettingsLayout.vue'

const settingsStore = useSettingsStore()
const ilinkStore = useILinkStore()
const message = useMessage()
const activeTab = ref('basic')

// 提示词默认值由后端 /api/ilink/config 提供（唯一来源在 server 的 prompt-defaults.ts），
// 前端不再自带副本，避免两边漂移。初始值为空，load 时由后端返回值覆盖。
const ilinkConfig = ref({
  // 启用意图：服务启动时是否自动拉起（与「启动/停止 Bot」是两层，见 docs/adr/0001）
  enabled: true,
  provider: 'qwen',
  model: 'qwen-turbo',
  system_prompt: '',
  note_tools_prompt: '',
  max_tool_rounds: 5,
  proactive_enabled: true,
  proactive_min_interval: 45,
  proactive_quiet_hours_start: 0,
  proactive_quiet_hours_end: 8,
  proactive_check_interval: 5,
  proactive_user_message: '',
  proactive_system_prompt: '',
  learning_prompt: '',
  memory_system_prompt: '',
  memory_user_template: ''
})

const ilinkProviderModels = computed(() => {
  const provider = settingsStore.availableProviders.find(item => item.name === ilinkConfig.value.provider)
  return provider?.models.map(model => ({ label: model.name, value: model.id })) || []
})

function handleILinkProviderChange(value: string) {
  ilinkConfig.value.provider = value
  const nextModels = settingsStore.availableProviders.find(item => item.name === value)?.models || []
  ilinkConfig.value.model = nextModels.some(model => model.id === ilinkConfig.value.model)
    ? ilinkConfig.value.model
    : (nextModels[0]?.id || '')
}

let statusPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await settingsStore.loadSettings()
  await ilinkStore.fetchConfig()
  await ilinkStore.fetchStatus()

  if (ilinkStore.config) {
    ilinkConfig.value = {
      enabled: ilinkStore.config.enabled ?? true,
      provider: ilinkStore.config.provider ?? 'qwen',
      model: ilinkStore.config.model ?? 'qwen-turbo',
      system_prompt: ilinkStore.config.system_prompt ?? '',
      note_tools_prompt: ilinkStore.config.note_tools_prompt ?? '',
      max_tool_rounds: ilinkStore.config.max_tool_rounds ?? 5,
      proactive_enabled: ilinkStore.config.proactive_enabled ?? true,
      proactive_min_interval: ilinkStore.config.proactive_min_interval ?? 45,
      proactive_quiet_hours_start: ilinkStore.config.proactive_quiet_hours_start ?? 0,
      proactive_quiet_hours_end: ilinkStore.config.proactive_quiet_hours_end ?? 8,
      proactive_check_interval: ilinkStore.config.proactive_check_interval ?? 5,
      proactive_user_message: ilinkStore.config.proactive_user_message ?? '',
      proactive_system_prompt: ilinkStore.config.proactive_system_prompt ?? '',
      learning_prompt: ilinkStore.config.learning_prompt ?? '',
      memory_system_prompt: ilinkStore.config.memory_system_prompt ?? '',
      memory_user_template: ilinkStore.config.memory_user_template ?? ''
    }
  }
  const initialModels = settingsStore.availableProviders.find(item => item.name === ilinkConfig.value.provider)?.models || []
  if (!initialModels.some(model => model.id === ilinkConfig.value.model)) {
    ilinkConfig.value.model = initialModels[0]?.id || ''
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

async function handleEnabledChange(value: boolean) {
  try {
    await ilinkStore.updateConfig({ enabled: value })
    ilinkConfig.value.enabled = value
    message.success(value ? '已启用：服务启动时会自动拉起' : '已关闭：不再自动拉起')
  } catch (err: any) {
    ilinkConfig.value.enabled = !value
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

// 四态映射的规则本身住在 utils/botState.ts（已被单测钉住），这里只负责喂给它当前事实
const botState = computed(() =>
  resolveBotState({
    enabled: ilinkConfig.value.enabled,
    running: ilinkStore.status?.running ?? false,
    loginStatus: ilinkStore.status?.login.status
  })
)
</script>

<template>
  <SettingsLayout title="微信 Bot">
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
            <label class="settings-field__label">启用微信机器人</label>
            <div class="ilink-enabled">
              <n-switch
                v-model:value="ilinkConfig.enabled"
                :loading="ilinkStore.isLoading"
                @update:value="handleEnabledChange"
              />
              <span class="ilink-enabled__hint">服务启动时自动拉起</span>
            </div>
            <div class="settings-field__hint">关闭后不再自动拉起，但手动启动仍然可用</div>
          </div>

          <div class="settings-field">
            <label class="settings-field__label">运行状态</label>
            <div class="ilink-status">
              <div :class="['status-dot', `status-dot--${botState.dot}`]" />
              <span>{{ botState.label }}</span>
              <span v-if="ilinkStore.status?.running && ilinkStore.status?.uptime" class="status-uptime">
                (已运行 {{ formatUptime(ilinkStore.status.uptime) }})
              </span>
              <span v-if="ilinkStore.status?.messages_processed" class="status-messages">
                · 处理 {{ ilinkStore.status.messages_processed }} 条消息
              </span>
            </div>
            <div v-if="botState.hint" class="settings-field__hint">{{ botState.hint }}</div>
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
                v-else
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
              <div v-else-if="ilinkStore.status?.login.status === 'expired'">
                <div class="status-dot status-dot--error" />
                <span>会话已过期，需重新扫码——请点上方「启动 Bot」</span>
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

    <div class="settings-section animate-slideIn" style="animation-delay: 100ms">
      <div class="settings-card">
        <n-tabs v-model:value="activeTab" type="line" animated>
          <n-tab-pane name="basic" tab="基础配置">
            <div class="settings-card__body">
              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">AI 提供商</label>
                  <n-select
                    v-model:value="ilinkConfig.provider"
                    :options="settingsStore.availableProviders.map(item => ({ label: item.displayName, value: item.name }))"
                    placeholder="选择提供商"
                    @update:value="handleILinkProviderChange"
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
                <label class="settings-field__label">笔记工具提示词</label>
                <n-input
                  v-model:value="ilinkConfig.note_tools_prompt"
                  type="textarea"
                  :rows="4"
                  placeholder="用于统一约束 Bot 和聊天模块何时调用 list_notes、search_note_lines、get_note_lines。"
                />
                <div class="settings-field__hint">这是共享配置，微信 Bot 普通模式、学习模式，以及聊天模块都会使用这段提示词。</div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">最大工具调用轮数</label>
                <n-input-number v-model:value="ilinkConfig.max_tool_rounds" :min="1" :max="100" />
                <div class="settings-field__hint">控制 Bot 在一次对话中最多调用工具的轮数</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存基础配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="proactive" tab="主动聊天">
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">启用主动聊天</label>
                <n-switch v-model:value="ilinkConfig.proactive_enabled" />
                <div class="settings-field__hint">关闭后定时器不再触发主动问候。</div>
              </div>

              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">最小发送间隔（分钟）</label>
                  <n-input-number v-model:value="ilinkConfig.proactive_min_interval" :min="1" :max="1440" />
                  <div class="settings-field__hint">距上次主动发送至少间隔该时长</div>
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">检查周期（分钟）</label>
                  <n-input-number v-model:value="ilinkConfig.proactive_check_interval" :min="1" :max="1440" />
                  <div class="settings-field__hint">定时器多久检查一次触发条件，保存后即时生效</div>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">安静时段开始（小时）</label>
                  <n-input-number v-model:value="ilinkConfig.proactive_quiet_hours_start" :min="0" :max="23" />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">安静时段结束（小时）</label>
                  <n-input-number v-model:value="ilinkConfig.proactive_quiet_hours_end" :min="0" :max="23" />
                </div>
              </div>
              <div class="settings-field">
                <div class="settings-field__hint">安静时段内不主动聊天，支持跨午夜（如 22-6，表示该时段外发送）。</div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">主动聊天系统提示词</label>
                <n-input
                  v-model:value="ilinkConfig.proactive_system_prompt"
                  type="textarea"
                  :rows="3"
                  placeholder="主动聊天时的 Bot 人设"
                />
                <div class="settings-field__hint">仅用于主动聊天模式，不影响普通对话。</div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">主动聊天触发指令</label>
                <n-input
                  v-model:value="ilinkConfig.proactive_user_message"
                  type="textarea"
                  :rows="2"
                  placeholder="主动聊天时发送给 AI 的指令"
                />
                <div class="settings-field__hint">控制主动聊天时 AI 生成的对话风格和内容。</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存主动聊天配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="learning" tab="学习模式">
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">学习模式提示词</label>
                <n-input
                  v-model:value="ilinkConfig.learning_prompt"
                  type="textarea"
                  :rows="6"
                  placeholder="学习模式的 system prompt，使用 {topic} 作为主题占位符。"
                />
                <div class="settings-field__hint">用户发送 /学习 主题 时使用，{topic} 会被替换为实际主题。</div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存学习模式配置
                </n-button>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="memory" tab="记忆整理">
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">记忆整理系统提示词</label>
                <n-input
                  v-model:value="ilinkConfig.memory_system_prompt"
                  type="textarea"
                  :rows="8"
                  placeholder="记忆整理 agent 的系统提示词，控制抽取规则与 add_memory 调用方式。"
                />
                <div class="settings-field__hint">每晚 00:30 整理对话时使用，修改后即时生效。</div>
              </div>

              <div class="settings-field">
                <label class="settings-field__label">记忆整理用户消息模板</label>
                <n-input
                  v-model:value="ilinkConfig.memory_user_template"
                  type="textarea"
                  :rows="6"
                  placeholder="用户消息模板，占位符：{beijingTime} {userId} {memoryDate} {recordCount} {transcript} {recentMemories}"
                />
                <div class="settings-field__hint">
                  占位符：{beijingTime} 当前北京时间、{userId} 微信用户 ID、{memoryDate} 整理日期（昨天）、{recordCount} 聊天条数、{transcript} 对话转录、{recentMemories} 已有记忆防重上下文。
                </div>
              </div>

              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存记忆整理配置
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
