# Todo 模块状态Tab重构

## 功能清单

### 1. Tab 标签切换
- 5个固定Tab：全部、待办(todo)、进行中(in_progress)、已完成(done)、已取消(cancelled)
- 点击Tab实时筛选对应状态的任务列表
- Tab显示对应状态的任务数量角标

### 2. 完成时间记录
- `todos` 表新增 `completed_at` 字段（DATETIME，NULL表示未完成）
- 任务状态变为"已完成"时，自动记录当前时间戳到 `completed_at`
- 任务状态从"已完成"变更为其他状态时，清除 `completed_at`

### 3. 排序规则
- **待办/进行中/已取消/全部（不含已完成）**：按 `due_date` 升序（截止时间越早越靠前）
- **已完成**：按 `completed_at` 升序（最近完成的排在前面）
- `due_date` 为 NULL 时排在最后

### 4. 登录弹窗提醒
- **触发时机**：用户登录成功后当天首次进入首页时
- **频率限制**：每天最多弹出一次，使用 `localStorage` 记录上次弹出日期
- **弹窗内容**：
  - 文案：「你有 X 项待办事项」
  - 可选勾选框：「今天不再提醒」
  - 点击文案可跳转至 todo 模块
- **样式**：NModal + NCard，使用 Naive UI 组件

## 数据模型

### todos 表变更
```sql
ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL;
```

### 本期不做
- 标签筛选（保持现有逻辑）
- 批量操作
- 任务导出

## 验收标准

### Tab切换
- Given 用户打开 Todo 模块
- When 用户点击任意Tab（待办/进行中/已完成/已取消）
- Then 列表只显示对应状态的任务，且当前Tab高亮

### 完成时间记录
- Given 用户将任务状态改为"已完成"
- When 操作成功
- Then `completed_at` 字段记录当前时间戳

### 排序验证
- Given 用户在"待办"Tab
- When 列表加载
- Then 任务按 `due_date` 升序排列，NULL排在最后
- Given 用户在"已完成"Tab
- When 列表加载
- Then 任务按 `completed_at` 降序排列

### 登录弹窗
- Given 用户在当天首次登录并跳转到首页
- When 存在待办事项（状态为todo且未删除）
- Then 弹出提醒弹窗，显示待办数量
- Given 用户勾选"今天不再提醒"并关闭弹窗
- Then 当天不再弹出，次日登录时重新判断
- Given 用户点击弹窗文案
- Then 跳转到 Todo 模块并关闭弹窗
