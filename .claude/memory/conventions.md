# 项目约定

> 记录团队需要统一遵守的编码规范和项目约定。
> 有新约定时追加，不删除历史条目。

## 数据库约定
- 标签以 JSON 数组存储在 TEXT 列，筛选用 SQLite json_each() 函数
- 软删除：todos、notes、conversations 用 is_deleted = 1，所有查询必须带 WHERE is_deleted = 0
- 新迁移文件命名：00N_描述.sql，服务器启动时自动执行

## 后端约定
- 分层架构：routes → controllers → services → database
- DB_PATH 通过 __dirname 解析，不用 process.cwd()
- .env 加载路径：resolve(__dirname, '../../.env')
- AI 提供商新增：在 providers.ts 的 AI_PROVIDERS 中添加，设置页自动渲染

## 前端约定
- 使用 unplugin-auto-import，无需手动 import Vue/Router/Pinia/NaiveUI API
- Pinia 使用组合式 API 风格
- 笔记自动保存：useDebounceFn 1000ms 防抖，无手动保存按钮
- SSE 解析按 \n\n 分割，提取 event: 和 data: 行

## 环境变量
- PORT=3000，DB_PATH 相对项目根目录，JWT_EXPIRES_IN=30d
- 生产部署前必须修改 JWT_SECRET