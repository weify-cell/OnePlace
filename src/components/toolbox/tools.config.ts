export interface ToolConfig {
  id: string
  name: string
  description: string
  category: string
  status: 'available' | 'coming-soon'
  icon: string
  routePath: string
}

export interface CategoryConfig {
  id: string
  name: string
  icon: string
}

export const CATEGORIES: CategoryConfig[] = [
  { id: 'dev', name: '开发辅助', icon: '🔧' },
  { id: 'text', name: '文本处理', icon: '📝' },
  { id: 'image', name: '图片处理', icon: '🖼️' },
  { id: 'coming', name: '即将推出', icon: '🚧' }
]

export const TOOLS: ToolConfig[] = [
  {
    id: 'json',
    name: 'JSON 格式化',
    description: '格式化、压缩、校验 JSON',
    category: 'dev',
    status: 'available',
    icon: '📋',
    routePath: '/toolbox/json'
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    description: 'Unix 时间戳与日期时间互转',
    category: 'dev',
    status: 'available',
    icon: '⏰',
    routePath: '/toolbox/timestamp'
  },
  {
    id: 'crontab',
    name: 'Cron 表达式',
    description: 'Cron 表达式与时间互转',
    category: 'dev',
    status: 'available',
    icon: '🔄',
    routePath: '/toolbox/crontab'
  },
  {
    id: 'text-diff',
    name: '文本比较',
    description: '逐字符比较文本差异',
    category: 'text',
    status: 'available',
    icon: '📊',
    routePath: '/toolbox/text-diff'
  },
  {
    id: 'image-base64',
    name: '图片 Base64',
    description: '图片与 Base64 互转',
    category: 'image',
    status: 'available',
    icon: '🖼️',
    routePath: '/toolbox/image-base64'
  },
  {
    id: 'date-calc',
    name: '日期计算',
    description: '计算日期差、添加减少时间',
    category: 'coming',
    status: 'coming-soon',
    icon: '📅',
    routePath: ''
  },
  {
    id: 'base64-codec',
    name: 'Base64 编解码',
    description: '文本 Base64 编码和解码，支持 URL-safe 模式',
    category: 'dev',
    status: 'available',
    icon: '🔐',
    routePath: '/toolbox/base64-codec'
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    description: 'URL 编码和解码，支持 encodeURIComponent 与 encodeURI 两种模式',
    category: 'dev',
    status: 'available',
    icon: '🔗',
    routePath: '/toolbox/url-codec'
  },
  {
    id: 'hash',
    name: '哈希计算',
    description: 'MD5、SHA1、SHA256 等哈希算法',
    category: 'coming',
    status: 'coming-soon',
    icon: '#️⃣',
    routePath: ''
  }
]

export function getToolById(id: string): ToolConfig | undefined {
  return TOOLS.find(tool => tool.id === id)
}

export function getToolsByCategory(categoryId: string): ToolConfig[] {
  if (categoryId === 'all') return TOOLS
  return TOOLS.filter(tool => tool.category === categoryId)
}

export function getCategoryById(id: string): CategoryConfig | undefined {
  return CATEGORIES.find(cat => cat.id === id)
}
