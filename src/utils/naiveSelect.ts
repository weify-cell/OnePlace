import type { SelectOption } from 'naive-ui'

/**
 * naive-ui 的 Select 类型不接受 `value: null`，但运行时支持——界面上正是用它表示"全部/无"。
 *
 * 所以这里只把类型放宽，**不改运行行为**：选项数组照旧带 null 值，
 * 免得为了让类型通过而把"全部"的取值改成 ''（那会真的改掉筛选逻辑）。
 */
export function asSelectOptions(
  options: Array<{ label: string; value: string | number | null }>
): SelectOption[] {
  return options as unknown as SelectOption[]
}
