package com.oneplace.collector

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 采集端唯一的界面：登录、开始/停止采集、看队列与日志。
 *
 * 刻意用系统控件手搭（不引 AndroidX/Compose）——依赖越少，这种"一次性小工具"越好维护。
 */
class MainActivity : Activity() {
  private lateinit var serverField: EditText
  private lateinit var passwordField: EditText
  private lateinit var statusView: TextView
  private lateinit var logView: TextView
  private lateinit var startButton: Button
  private lateinit var stopButton: Button

  private val handler = Handler(Looper.getMainLooper())
  private var lastLogVersion = -1
  private val refresher = object : Runnable {
    override fun run() {
      refreshStatus()
      handler.postDelayed(this, 2000)
    }
  }

  private val permissionRequestCode = 1001

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(buildUi())
    serverField.setText(AppPrefs.serverUrl(this))
    handler.post(refresher)
  }

  override fun onDestroy() {
    handler.removeCallbacks(refresher)
    super.onDestroy()
  }

  private fun buildUi(): ScrollView {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(48, 48, 48, 48)
    }

    root.addView(title("OnePlace 手机轨迹采集"))
    root.addView(hint("手机每 60 秒（或移动 50 米以上）记一个点，攒起来发到服务器；没网时先存在手机里，联网后自动补传。"))

    root.addView(label("服务器地址"))
    serverField = EditText(this).apply { setSingleLine(true) }
    root.addView(serverField, wide())

    root.addView(label("访问密码（和网页登录同一个）"))
    passwordField = EditText(this).apply {
      setSingleLine(true)
      inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
    }
    root.addView(passwordField, wide())

    root.addView(button("登录并保存令牌") { login() }, wide())

    root.addView(label("设备号（服务端用它区分设备，别改）"))
    root.addView(hint(AppPrefs.deviceId(this)))

    startButton = button("开始采集") {
      AppPrefs.setServerUrl(this, serverField.text.toString())
      if (ensurePermissions()) startCollecting()
    }
    stopButton = button("停止采集") {
      LocationService.stop(this)
      AppPrefs.setCollecting(this, false)
      refreshStatus()
    }
    root.addView(startButton, wide())
    root.addView(stopButton, wide())
    root.addView(button("允许后台定位（息屏后继续采）") { requestBackgroundLocation() }, wide())

    root.addView(label("状态"))
    statusView = TextView(this).apply { textSize = 14f }
    root.addView(statusView, wide())

    root.addView(label("日志"))
    logView = TextView(this).apply {
      textSize = 12f
      typeface = android.graphics.Typeface.MONOSPACE
    }
    root.addView(logView, wide())

    return ScrollView(this).apply { addView(root) }
  }

  private fun title(text: String) = TextView(this).apply {
    this.text = text
    textSize = 20f
    setPadding(0, 0, 0, 16)
  }

  private fun label(text: String) = TextView(this).apply {
    this.text = text
    textSize = 14f
    setPadding(0, 24, 0, 8)
  }

  private fun hint(text: String) = TextView(this).apply {
    this.text = text
    textSize = 12f
    setPadding(0, 4, 0, 4)
  }

  private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
    this.text = text
    setOnClickListener { onClick() }
  }

  private fun wide() = LinearLayout.LayoutParams(
    ViewGroup.LayoutParams.MATCH_PARENT,
    ViewGroup.LayoutParams.WRAP_CONTENT
  ).apply { gravity = Gravity.START }

  // ── 行为 ────────────────────────────────────────────────

  private fun login() {
    val server = serverField.text.toString().trim().trimEnd('/')
    val password = passwordField.text.toString()
    if (server.isBlank() || password.isBlank()) {
      Logs.append("登录失败：地址或密码为空")
      refreshStatus()
      return
    }
    AppPrefs.setServerUrl(this, server)
    Logs.append("正在登录 $server …")
    Thread {
      try {
        val token = ApiClient.login(server, password)
        AppPrefs.setToken(this, token)
        AppPrefs.setTokenInvalid(this, false)
        Logs.append("登录成功，令牌已保存")
      } catch (e: Exception) {
        Logs.append("登录失败：${e.message}")
      }
      handler.post { refreshStatus() }
    }.start()
    refreshStatus()
  }

  /** 定位与通知权限（Android 13 起通知也要单独要）。 */
  private fun ensurePermissions(): Boolean {
    val needed = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      needed.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    val missing = needed.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isEmpty()) return true
    requestPermissions(missing.toTypedArray(), permissionRequestCode)
    Logs.append("已请求权限，允许后请再点一次「开始采集」")
    return false
  }

  /**
   * 后台定位：Android 11 起不允许用对话框直接授予，只能引导到系统页面选「始终允许」。
   */
  private fun requestBackgroundLocation() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Logs.append("请在接下来的页面里选「始终允许」，否则息屏后不再采集")
      startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
      )
    } else {
      requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), permissionRequestCode)
    }
  }

  private fun startCollecting() {
    LocationService.start(this)
    AppPrefs.setCollecting(this, true)
    refreshStatus()
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != permissionRequestCode) return
    val granted = permissions.indices.count { grantResults[it] == PackageManager.PERMISSION_GRANTED }
    Logs.append("权限结果：${granted}/${permissions.size} 项已允许")
    if (granted == permissions.size && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
      startCollecting()
    }
    refreshStatus()
  }

  private fun refreshStatus() {
    val collecting = AppPrefs.collecting(this)
    startButton.isEnabled = !collecting
    stopButton.isEnabled = collecting

    val last = AppPrefs.lastUploadAt(this)
    val lastText = if (last == 0L) "—" else SimpleDateFormat("HH:mm:ss", Locale.US).format(Date(last))
    statusView.text = buildString {
      append("采集：").append(if (collecting) "进行中" else "已停止").append('\n')
      append("令牌：").append(
        when {
          AppPrefs.token(this@MainActivity).isBlank() -> "未登录"
          AppPrefs.tokenInvalid(this@MainActivity) -> "已失效（请重新登录）"
          else -> "有效"
        }
      ).append('\n')
      append("待上传：").append(PointStore.size(this@MainActivity)).append(" 个点\n")
      append("累计新增：").append(AppPrefs.uploadedCount(this@MainActivity)).append(" 个点\n")
      append("上次上报：").append(lastText).append('\n')
      append("定位权限：").append(if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) "已允许" else "未允许").append('\n')
      append("后台定位：").append(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
          checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        ) "已允许" else "未允许（息屏可能暂停）"
      )
    }

    if (Logs.version != lastLogVersion) {
      lastLogVersion = Logs.version
      logView.text = Logs.text()
    }
  }
}
