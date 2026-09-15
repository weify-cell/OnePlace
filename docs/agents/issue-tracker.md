# 工单存放位置：本地 Markdown

本仓库的 issue 与 spec 以 markdown 文件形式存放在 `.scratch/` 目录下，**不使用 GitHub Issues**——GitHub 仅作为代码托管，一切工作在本本地完成。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- 规格文档：`.scratch/<feature-slug>/spec.md`
- 实施工单：每条工单一个文件 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号；**不要**用单个合并的 tickets 文件
- 分诊状态：在每个 issue 文件顶部附近写一行 `Status:`（取值见 `triage-labels.md`）
- 评论与讨论历史：追加到文件末尾的 `## Comments` 标题下

## 当 skill 说「发布到 issue tracker」时

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当 skill 说「取相关工单」时

直接读取对应路径的文件。用户通常会把路径或工单编号直接给出。

## 寻路（wayfinder）操作

供 `/wayfinder` 使用。**地图**是一个文件，每个工单一个**子文件**。

- **地图**：`.scratch/<effort>/map.md`（含 Notes / Decisions-so-far / Fog 正文）
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，问题写在正文
  - `Type:` 行记录类型（`research`/`prototype`/`grilling`/`task`）
  - `Status:` 行记录 `claimed`/`resolved`
- **阻塞**：顶部一行 `Blocked by: NN, NN`；所列文件全部 `resolved` 时该工单解除阻塞
- **前沿（frontier）**：扫描 `.scratch/<effort>/issues/`，取**未完成、未阻塞、未认领**的文件，编号最小者优先
- **认领**：先把 `Status: claimed` 写入并保存，之后才开始工作
- **解决**：在 `## Answer` 标题下追加答案，写 `Status: resolved`，再把上下文指针追加到 `map.md` 的 Decisions-so-far
