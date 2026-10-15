// 根构建：只声明插件版本，具体配置在 :app
plugins {
  // AGP 9.x 与本地 SDK（Android 17 / API 37）配套。
  // 注意：AGP 9 起**内置 Kotlin 支持**，不再需要（且不允许）再加 org.jetbrains.kotlin.android。
  id("com.android.application") version "9.4.1" apply false
}
