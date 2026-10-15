package com.oneplace.collector

import android.content.Context
import java.util.UUID

/**
 * 采集端的本地状态：服务器地址、登录令牌、设备号、待上传队列。
 *
 * 队列落 SharedPreferences（不是内存）——没网、被系统杀掉、重启之后，
 * 攒下的点不该丢。这也是"App 断网重传"能成立的前提。
 */
object AppPrefs {
  private const val FILE = "oneplace_collector"
  const val DEFAULT_SERVER = "http://99macbook-air.tail53cc79.ts.net:3000"

  private fun sp(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun serverUrl(ctx: Context): String =
    sp(ctx).getString("server_url", DEFAULT_SERVER)?.trimEnd('/') ?: DEFAULT_SERVER

  fun setServerUrl(ctx: Context, value: String) {
    sp(ctx).edit().putString("server_url", value.trim().trimEnd('/')).apply()
  }

  fun token(ctx: Context): String = sp(ctx).getString("token", "") ?: ""

  fun setToken(ctx: Context, value: String) {
    sp(ctx).edit().putString("token", value).apply()
  }

  /** 设备号：首次启动生成一次，之后固定（服务端用它做去重与多设备区分）。 */
  fun deviceId(ctx: Context): String {
    val existing = sp(ctx).getString("device_id", "")
    if (!existing.isNullOrBlank()) return existing
    val generated = "redmi-k70-" + UUID.randomUUID().toString().take(8)
    sp(ctx).edit().putString("device_id", generated).apply()
    return generated
  }

  fun collecting(ctx: Context): Boolean = sp(ctx).getBoolean("collecting", false)

  fun setCollecting(ctx: Context, value: Boolean) {
    sp(ctx).edit().putBoolean("collecting", value).apply()
  }

  fun queue(ctx: Context): String = sp(ctx).getString("queue", "[]") ?: "[]"

  fun setQueue(ctx: Context, value: String) {
    sp(ctx).edit().putString("queue", value).apply()
  }

  fun lastUploadAt(ctx: Context): Long = sp(ctx).getLong("last_upload_at", 0L)

  fun setLastUploadAt(ctx: Context, value: Long) {
    sp(ctx).edit().putLong("last_upload_at", value).apply()
  }

  fun uploadedCount(ctx: Context): Int = sp(ctx).getInt("uploaded_count", 0)

  fun addUploadedCount(ctx: Context, value: Int) {
    sp(ctx).edit().putInt("uploaded_count", uploadedCount(ctx) + value).apply()
  }

  /** 令牌失效（服务端 401）：界面提示重新登录。 */
  fun tokenInvalid(ctx: Context): Boolean = sp(ctx).getBoolean("token_invalid", false)

  fun setTokenInvalid(ctx: Context, value: Boolean) {
    sp(ctx).edit().putBoolean("token_invalid", value).apply()
  }
}
