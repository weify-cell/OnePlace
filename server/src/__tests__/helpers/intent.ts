import { setSetting } from '../../services/settings.service.js'

/** 设置当前的启用意图（走应用自己的设置接口，不直接改库） */
export function setEnabled(enabled: boolean): void {
  setSetting('ilink_enabled', enabled)
}
