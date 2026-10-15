package com.oneplace.collector

import android.content.Context
import android.location.Location
import org.json.JSONArray
import org.json.JSONObject

/**
 * 待上传的点队列。
 *
 * 队列有上限（`MAX_QUEUE`）：手机长期断网时不能无限攒，攒爆 SharedPreferences 反而会让
 * 整个 App 卡住。满了丢**最旧**的点——最新的轨迹比几个月前的更有用。
 */
object PointStore {
  const val MAX_QUEUE = 5000
  /** 一次最多上传多少个点（服务端单批上限 1000，留出余量） */
  const val BATCH_SIZE = 500

  data class Point(
    val recordedAt: String,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?,
    val speed: Float?,
    val source: String?
  )

  private fun read(ctx: Context): MutableList<JSONObject> {
    val raw = AppPrefs.queue(ctx)
    return try {
      val array = JSONArray(raw)
      MutableList(array.length()) { array.getJSONObject(it) }
    } catch (e: Exception) {
      // 队列坏了不能连累采集：从空队列重新开始
      Logs.append("队列解析失败，已重置：${e.message}")
      mutableListOf()
    }
  }

  private fun write(ctx: Context, list: MutableList<JSONObject>) {
    val array = JSONArray()
    list.forEach { array.put(it) }
    AppPrefs.setQueue(ctx, array.toString())
  }

  fun size(ctx: Context): Int = read(ctx).size

  /** 记一个点（由定位回调调用）。 */
  fun add(ctx: Context, location: Location, deviceId: String) {
    val point = JSONObject().apply {
      put("device_id", deviceId)
      // 服务端要能用 Date.parse 解析的 UTC ISO 串
      put("recorded_at", isoUtc(location.time))
      put("latitude", location.latitude)
      put("longitude", location.longitude)
      if (location.hasAccuracy()) put("accuracy", location.accuracy.toDouble())
      if (location.hasSpeed()) put("speed", location.speed.toDouble())
      put("source", location.provider ?: "unknown")
    }
    val list = read(ctx)
    list.add(point)
    while (list.size > MAX_QUEUE) list.removeAt(0)
    write(ctx, list)
  }

  /** 取一批待上传的点（不超过 [BATCH_SIZE]），返回 JSON 数组串与条数。 */
  fun takeBatch(ctx: Context): Pair<String, Int> {
    val list = read(ctx)
    val batch = list.take(BATCH_SIZE)
    val array = JSONArray()
    batch.forEach { array.put(it) }
    return array.toString() to batch.size
  }

  /**
   * 上传成功后从队列里移除前 [count] 条。
   *
   * 只在**服务端确认收到之后**才调用：服务端按 (device_id, recorded_at) 幂等，
   * 所以"上传成功但确认丢失"时重传是安全的，而"还没成功就删"会真的丢点。
   */
  fun dropFirst(ctx: Context, count: Int) {
    val list = read(ctx)
    if (count >= list.size) {
      write(ctx, mutableListOf())
      return
    }
    write(ctx, list.drop(count).toMutableList())
  }

  private fun isoUtc(ms: Long): String =
    java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
      .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
      .format(java.util.Date(ms))
}
