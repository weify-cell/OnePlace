# OnePlace 手机轨迹采集端（安卓）

只做一件事：按固定间隔取一个定位点，攒起来上报到 OnePlace 服务端。分析与解释全在服务端
（见 `docs/adr/0003-phone-data-pipeline.md`：采集端保持极薄）。

## 构建

```bash
# 本机已验证的组合：AGP 9.4.1 + Gradle 9.8.1 + JDK 17 + SDK Platform 37（Android 17）
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
~/tools/gradle-9.8.1/bin/gradle assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

用 Android Studio 打开 `android/` 目录也可以（它自带 JDK，不用额外配）。

> 版本坑：**AGP 9 起内置 Kotlin 支持**，不要再加 `org.jetbrains.kotlin.android` 插件——
> 加了会直接构建失败，报错原文就写着"no longer required for Kotlin support since AGP 9.0"。

## 设计约束（都是踩过才知道的）

- **不用 GMS**：这台 Redmi K70 Pro 没有 Google 服务，所以不能用 Play Services 的融合定位，
  改用系统框架的 `LocationManager`（API 31+ 的 `FUSED_PROVIDER` 不需要 GMS），退化到 GPS。
- **不引 AndroidX / Compose**：界面用系统控件手搭，整个 APK 2.5 MB，依赖越少越不容易坏。
- **前台服务**：Android 8 之后后台拿不到定位，必须前台服务；Android 14 起不允许后台偷偷
  启动定位类前台服务，所以**只能由你在界面上点「开始采集」**，重启手机后也要再点一次。
- **没网也不丢点**：点先落本地队列（上限 5000，满了丢最旧的），每 60 秒试一次上传；
  服务端按 `(device_id, recorded_at)` 幂等，所以"上传成功但确认丢了"时重传是安全的。
- **明文 HTTP**：走 Tailscale 内网直连（`http://99macbook-air.tail53cc79.ts.net:3000`），
  自用单机不上公网，所以开了 `usesCleartextTraffic`。

## 用法

1. 装好后打开，填服务器地址（默认已填 Tailscale 地址）与访问密码，点「登录并保存令牌」。
2. 点「允许后台定位」→ 在系统页面选「始终允许」（不然息屏后不再采集）。
3. 点「开始采集」。之后状态区会显示队列长度、上次上报时间与累计点数。
