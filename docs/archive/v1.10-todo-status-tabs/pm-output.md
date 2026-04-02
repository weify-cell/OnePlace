# PM Handoff - Todo 模块状态Tab重构

## 需求文档
docs/prd/todo-status-tabs-redesign.md

## 确认需求

1. **5个Tab**：全部、待办(todo)、进行中(in_progress)、已完成(done)、已取消(cancelled)
2. **完成时间记录**：新增 `completed_at` 字段
3. **排序规则**：已完成按 `completed_at` 降序，其他按 `due_date` 升序
4. **登录弹窗**：每天首次登录弹出，带"今天不再提醒"选项

## 交付物

- [x] PRD：docs/prd/todo-status-tabs-redesign.md
- [ ] 架构设计
- [ ] 前端开发
- [ ] 测试验收

## 数据库变更

```sql
ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL;
```

## 下一步

启动 architect agent 进行架构设计
