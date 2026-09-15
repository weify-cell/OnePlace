import { getSettingValue } from '../settings.service.js'

/** 微信层使用的模型（唯一来源：`ilink_provider` / `ilink_model` 设置）。 */
export function getILinkModel(): { provider: string; model: string } {
  return {
    provider: getSettingValue<string>('ilink_provider', 'qwen'),
    model: getSettingValue<string>('ilink_model', 'qwen-turbo')
  }
}
