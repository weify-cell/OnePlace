package com.oneplace.collector

import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** 采集端的网络调用：登录换令牌、上报轨迹点。只用 HttpURLConnection，不引第三方库。 */
object ApiClient {
  data class UploadResult(val accepted: Int, val duplicate: Int, val rejected: Int)

  class HttpError(val status: Int, val body: String) : Exception("HTTP $status: $body")

  /** 单密码登录，返回 JWT。 */
  fun login(serverUrl: String, password: String): String {
    val connection = open("$serverUrl/api/auth/login")
    connection.requestMethod = "POST"
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    val body = """{"password":${quote(password)}}"""
    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

    val (status, text) = read(connection)
    if (status !in 200..299) throw HttpError(status, text)
    return org.json.JSONObject(text).optString("token").also {
      if (it.isBlank()) throw HttpError(status, "响应里没有 token：$text")
    }
  }

  /** 上报一批点。服务端按 (device_id, recorded_at) 幂等，重传不会产生重复。 */
  fun upload(serverUrl: String, token: String, deviceId: String, pointsJson: String): UploadResult {
    val connection = open("$serverUrl/api/phone/locations")
    connection.requestMethod = "POST"
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.setRequestProperty("Authorization", "Bearer $token")
    val body = """{"device_id":${quote(deviceId)},"points":$pointsJson}"""
    connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

    val (status, text) = read(connection)
    if (status == 401) throw HttpError(status, text)
    if (status !in 200..299) throw HttpError(status, text)
    val json = org.json.JSONObject(text)
    return UploadResult(
      accepted = json.optInt("accepted", 0),
      duplicate = json.optInt("duplicate", 0),
      rejected = json.optInt("rejected", 0)
    )
  }

  private fun open(url: String): HttpURLConnection =
    (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 30_000
      // Tailscale 内网直连，不走代理
      useCaches = false
    }

  private fun read(connection: HttpURLConnection): Pair<Int, String> {
    val status = connection.responseCode
    val stream = if (status in 200..299) connection.inputStream else connection.errorStream
    val text = stream?.let { s ->
      BufferedReader(s.reader(Charsets.UTF_8)).use { it.readText() }
    } ?: ""
    connection.disconnect()
    return status to text
  }

  private fun quote(value: String): String = org.json.JSONObject.quote(value)
}
