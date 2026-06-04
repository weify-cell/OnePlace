// iLink 协议类型定义

export const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'

// 二维码响应
export interface QRCodeResponse {
  qrcode: string
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired'
}

// 二维码状态响应
export interface QRCodeStatusResponse {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired'
  bot_token?: string
  error?: string
}

// 入站消息
export interface InboundMessage {
  msg_id: string
  from_user: string
  to_user: string
  msg_type: 'text' | 'image' | 'voice' | 'video' | 'file'
  content: string
  context_token: string
  timestamp: number
  // 媒体相关
  media_url?: string
  media_id?: string
}

// getupdates 响应
export interface GetUpdatesResponse {
  messages: InboundMessage[]
  has_more: boolean
  error?: string
}

// 发送消息请求
export interface SendMessageRequest {
  context_token: string
  msg_type: 'text' | 'image' | 'file'
  content: string
  media_id?: string
}

// 发送消息响应
export interface SendMessageResponse {
  msg_id: string
  status: 'ok' | 'error'
  error?: string
}

// 发送"正在输入"请求
export interface SendTypingRequest {
  context_token: string
}

// Bot 配置
export interface ILinkBotConfig {
  enabled: boolean
  bot_token: string
  api_base_url: string
  provider: string
  model: string
  system_prompt: string
  max_tool_rounds: number
}

// Bot 状态
export interface ILinkBotStatus {
  running: boolean
  uptime: number | null
  messages_processed: number
  last_message_at: string | null
  error: string | null
}

// 默认配置
export const DEFAULT_ILINK_CONFIG: ILinkBotConfig = {
  enabled: false,
  bot_token: '',
  api_base_url: ILINK_BASE_URL,
  provider: 'qwen',
  model: 'qwen-turbo',
  system_prompt: '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。',
  max_tool_rounds: 5
}
