# 领域文档

工程类 skill 在探索代码库时应如何消费本仓库的领域文档。

## 探索之前先读

- 仓库根目录的 **`CONTEXT.md`**
- 或根目录的 **`CONTEXT-MAP.md`**（若存在）：它指向每个上下文的 `CONTEXT.md`，按主题读取相关的那几份
- **`docs/adr/`**：读取与你即将改动的区域相关的 ADR

若这些文件不存在，**静默跳过**：不要提示缺失，也不要主动建议创建。它们由 `/domain-modeling`（经 `/grill-with-docs`、`/improve-codebase-architecture` 触达）在术语或决策真正落实时惰性生成。

## 文件结构

本仓库为**单上下文**（single-context）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-xxx.md
│   └── 0002-xxx.md
├── src/          ← 前端（Vue 3）
└── server/src/   ← 后端（Express + SQLite）
```

前端的 `src/` 与后端的 `server/src/` 同属**一个**上下文，不拆分。

（存在根 `CONTEXT-MAP.md` 时为多上下文，本仓库不是。）

## 使用术语表词汇

输出中提及领域概念时（工单标题、重构提案、假设、测试名），使用 `CONTEXT.md` 中定义的术语，不要漂移到术语表明确回避的同义词。

若需要的概念尚未进入术语表，这是个信号：要么你在发明项目并不使用的语言（重新考虑），要么确实存在空缺（记下来交给 `/domain-modeling`）。

## 标记 ADR 冲突

若输出与既有 ADR 冲突，请显式指出而非静默覆盖：

> _与 ADR-0007 冲突，但值得重新讨论，因为……_
