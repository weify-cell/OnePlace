import { ILINK_BASE_URL, type QRCodeResponse, type QRCodeStatusResponse, type GetUpdatesResponse, type SendMessageRequest, type SendMessageResponse, type SendTypingRequest } from './types.js'

/**
 * iLink API 客户端
 */
export class ILinkClient {
  private baseUrl: string

  constructor(baseUrl: string = ILINK_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * 获取登录二维码
   */
  async getQRCode(botType: number = 3): Promise<QRCodeResponse> {
    const response = await fetch(`${this.baseUrl}/get_bot_qrcode?bot_type=${botType}`)
    if (!response.ok) {
      throw new Error(`getQRCode failed: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<QRCodeResponse>
  }

  /**
   * 查询二维码状态
   */
  async getQRCodeStatus(qrcode: string): Promise<QRCodeStatusResponse> {
    const response = await fetch(`${this.baseUrl}/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`)
    if (!response.ok) {
      throw new Error(`getQRCodeStatus failed: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<QRCodeStatusResponse>
  }

  /**
   * 长轮询获取消息（35秒挂起）
   */
  async getUpdates(botToken: string, timeout: number = 35): Promise<GetUpdatesResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), (timeout + 5) * 1000)

    try {
      const response = await fetch(`${this.baseUrl}/getupdates`, {
        method: 'POST',
        headers: {
          'AuthorizationType': 'ilink_bot_token',
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timeout }),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`getUpdates failed: ${response.status} ${errorText}`)
      }

      return response.json() as Promise<GetUpdatesResponse>
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(botToken: string, request: SendMessageRequest): Promise<SendMessageResponse> {
    const response = await fetch(`${this.baseUrl}/sendmessage`, {
      method: 'POST',
      headers: {
        'AuthorizationType': 'ilink_bot_token',
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`sendMessage failed: ${response.status} ${errorText}`)
    }

    return response.json() as Promise<SendMessageResponse>
  }

  /**
   * 发送"正在输入"状态
   */
  async sendTyping(botToken: string, request: SendTypingRequest): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sendtyping`, {
      method: 'POST',
      headers: {
        'AuthorizationType': 'ilink_bot_token',
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      // typing 失败不影响主流程，只记录日志
      console.warn(`[ilink] sendTyping failed: ${response.status}`)
    }
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(botToken: string, contextToken: string, content: string): Promise<SendMessageResponse> {
    return this.sendMessage(botToken, {
      context_token: contextToken,
      msg_type: 'text',
      content
    })
  }
}

// 导出单例
export const ilinkClient = new ILinkClient()
