package com.oneplace.collector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * 定位采集前台服务。
 *
 * 为什么必须是前台服务：Android 8 之后后台应用拿不到定位；Android 14 起更不允许
 * 后台"偷偷启动"一个定位类前台服务——所以**只能由用户在前台界面里点「开始采集」**，
 * 重启手机后也要用户再点一次（这一点写进了工单记录，不是疏漏）。
 *
 * 定位来源用系统框架的 `LocationManager`：这台手机没有 GMS，用不了 Google Play
 * 的融合定位；API 31+ 的 `FUSED_PROVIDER` 是系统自带的，不需要 GMS。
 *
 * 采集与上传解耦：定位回调只管往队列里塞点，上传线程按固定间隔取一批发出去。
 * 没网时队列继续攒，联网后自动补传。
 */
class LocationService : Service() {
  companion object {
    private const val CHANNEL_ID = "oneplace_collector"
    private const val NOTIFICATION_ID = 1
    private const val UPLOAD_INTERVAL_SECONDS = 60L
    private const val LOCATION_MIN_INTERVAL_MS = 60_000L
    private const val LOCATION_MIN_DISTANCE_M = 50f

    fun start(ctx: Context) {
      val intent = Intent(ctx, LocationService::class.java)
      ctx.startForegroundService(intent)
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, LocationService::class.java))
    }
  }

  private lateinit var locationManager: LocationManager
  private lateinit var uploader: ScheduledExecutorService

  private val locationListener = object : LocationListener {
    override fun onLocationChanged(location: Location) {
      val deviceId = AppPrefs.deviceId(this@LocationService)
      PointStore.add(this@LocationService, location, deviceId)
      Logs.append(
        "记一个点：${"%.5f".format(location.latitude)}, ${"%.5f".format(location.longitude)}" +
          " ±${location.accuracy.toInt()}m（队列 ${PointStore.size(this@LocationService)}）"
      )
    }

    @Deprecated("Android 8 起不再回调，保留是因为接口要求")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) {
      Logs.append("定位源被关闭：$provider")
    }
  }

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    createChannel()
    startAsForeground()
    uploader = Executors.newSingleThreadScheduledExecutor()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    AppPrefs.setCollecting(this, true)
    AppPrefs.setLastUploadAt(this, 0L)
    requestUpdates()
    uploader.scheduleWithFixedDelay(
      { runCatching { uploadOnce() }.onFailure { Logs.append("上传线程异常：${it.message}") } },
      UPLOAD_INTERVAL_SECONDS,
      UPLOAD_INTERVAL_SECONDS,
      TimeUnit.SECONDS
    )
    // 立即试一次：如果队列里有上次没发出去的点，早点补上
    uploader.execute { runCatching { uploadOnce() } }
    Logs.append("采集已开始（每 ${LOCATION_MIN_INTERVAL_MS / 1000} 秒或移动 ${LOCATION_MIN_DISTANCE_M.toInt()} 米记一个点）")
    return START_STICKY
  }

  override fun onDestroy() {
    AppPrefs.setCollecting(this, false)
    runCatching { locationManager.removeUpdates(locationListener) }
    runCatching { uploader.shutdownNow() }
    Logs.append("采集已停止")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createChannel() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "轨迹采集", NotificationManager.IMPORTANCE_LOW)
      channel.description = "采集定位并上报到 OnePlace（常驻通知是系统要求，不是提醒你什么）"
      manager.createNotificationChannel(channel)
    }
  }

  private fun startAsForeground() {
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification: Notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("正在采集位置")
      .setContentText("待上传 ${PointStore.size(this)} 个点")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setContentIntent(open)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun requestUpdates() {
    val provider = pickProvider()
    try {
      @Suppress("DEPRECATION")
      locationManager.requestLocationUpdates(
        provider,
        LOCATION_MIN_INTERVAL_MS,
        LOCATION_MIN_DISTANCE_M,
        locationListener,
        Looper.getMainLooper()
      )
    } catch (e: SecurityException) {
      Logs.append("没有定位权限，采集无法开始：${e.message}")
      stopSelf()
    } catch (e: Exception) {
      Logs.append("请求定位更新失败：${e.message}")
    }
  }

  /** 优先用系统融合定位（API 31+，不需要 GMS），退化到 GPS。 */
  private fun pickProvider(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val fused = runCatching { LocationManager::class.java.getField("FUSED_PROVIDER").get(null) as String }.getOrNull()
      if (fused != null && locationManager.allProviders.contains(fused)) return fused
    }
    return LocationManager.GPS_PROVIDER
  }

  /** 取一批队列里的点上报；只有服务端确认后才从队列移除。 */
  private fun uploadOnce() {
    if (!AppPrefs.collecting(this)) return
    val token = AppPrefs.token(this)
    if (token.isBlank()) {
      Logs.append("还没登录（没有令牌），先在上面的界面里登录")
      return
    }

    val (pointsJson, count) = PointStore.takeBatch(this)
    if (count == 0) return

    try {
      val result = ApiClient.upload(AppPrefs.serverUrl(this), token, AppPrefs.deviceId(this), pointsJson)
      PointStore.dropFirst(this, count)
      AppPrefs.addUploadedCount(this, result.accepted)
      AppPrefs.setLastUploadAt(this, System.currentTimeMillis())
      AppPrefs.setTokenInvalid(this, false)
      Logs.append("上报 $count 个点 → 新增 ${result.accepted}、重复 ${result.duplicate}、不合格 ${result.rejected}")
      refreshNotification()
    } catch (e: ApiClient.HttpError) {
      if (e.status == 401) {
        AppPrefs.setTokenInvalid(this, true)
        Logs.append("令牌失效：请回到界面重新登录")
      } else {
        Logs.append("上报被拒绝 HTTP ${e.status}：${e.body.take(160)}")
      }
    } catch (e: Exception) {
      // 网络问题：点留在队列里，下一轮再试
      Logs.append("上报失败（点仍留着，稍后重试）：${e.message}")
    }
  }

  private fun refreshNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val open = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    manager.notify(
      NOTIFICATION_ID,
      Notification.Builder(this, CHANNEL_ID)
        .setContentTitle("正在采集位置")
        .setContentText("待上传 ${PointStore.size(this)} 个点")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setOngoing(true)
        .setContentIntent(open)
        .build()
    )
  }
}
