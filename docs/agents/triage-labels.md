# 分诊标签词表

各 skill 以五个标准分诊角色沟通。本文件把角色映射到本仓库实际使用的标签字符串。

| mattpocock/skills 中的角色 | 本仓库使用的标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 维护者需评估此工单 |
| `needs-info` | `needs-info` | 等待报告人补充信息 |
| `ready-for-agent` | `ready-for-agent` | 规格完整，可交给 AFK agent |
| `ready-for-human` | `ready-for-human` | 需人工实现 |
| `wontfix` | `wontfix` | 不予处理 |

当 skill 提到某个角色（如「打上 AFK-ready 分诊标签」）时，使用本表右列的标签字符串。

若实际使用的词表不同，直接修改右列即可。
