plugins {
  // Kotlin 支持由 AGP 9 内置（无需 org.jetbrains.kotlin.android）
  id("com.android.application")
}

android {
  namespace = "com.oneplace.collector"
  // 本地装的是 Android 17（API 37）
  compileSdk = 37

  defaultConfig {
    applicationId = "com.oneplace.collector"
    minSdk = 29
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"
  }

  buildTypes {
    release {
      // 自用，不做混淆：出问题时堆栈可读比体积重要
      isMinifyEnabled = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  // 刻意不引 AndroidX / Compose / Play Services：
  // 这台手机没有 GMS（用系统 LocationManager），依赖越少构建越不容易出问题。
  buildFeatures {
    buildConfig = false
  }
}
