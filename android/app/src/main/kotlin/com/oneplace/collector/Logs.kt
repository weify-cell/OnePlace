package com.oneplace.collector

/**
 * 采集端的内嵌日志：手机在兜里跑，看不到 logcat——界面得能自己说清发生了什么。
 * 只在内存里留最近 [MAX_LINES] 行（重启就清空，不占存储）。
 */
object Logs {
  private const val MAX_LINES = 200
  private val lines = ArrayDeque<String>()

  /** 每次写入自增，界面据此判断要不要刷新（避免无脑轮询重绘） */
  @Volatile
  var version: Int = 0
    private set

  fun append(message: String) {
    synchronized(lines) {
      val stamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date())
      lines.addLast("$stamp $message")
      while (lines.size > MAX_LINES) lines.removeFirst()
      version++
    }
  }

  fun text(): String = synchronized(lines) { lines.joinToString("\n") }
}
