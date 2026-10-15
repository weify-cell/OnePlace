// 采集端（安卓）的 Gradle 设置。
// 单仓库里的独立构建：android/ 自己一套，与根的 Node 工程互不影响。
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "OnePlaceCollector"
include(":app")
