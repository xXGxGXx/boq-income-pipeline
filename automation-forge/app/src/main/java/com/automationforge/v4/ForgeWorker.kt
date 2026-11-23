package com.automationforge.v4

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

class ForgeWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    private val progress = context.getSharedPreferences("forge_progress", Context.MODE_PRIVATE)

    override fun doWork(): Result {
        val workId = id.toString()
        val key = "next_step_$workId"
        val label = inputData.getString("label") ?: "Native workflow"
        val history = ForgeHistory(applicationContext)
        // After an interruption or a retry, carry on from the first step that hasn't finished, so earlier notifications
        // and webhooks are not sent twice. (A periodic job keeps its id, so the key is cleared when a run completes.)
        val start = progress.getInt(key, 0)
        history.log(workId, label, if (start > 0) "RESUMED" else "STARTED", if (start > 0) "Continuing at step ${start + 1} (attempt ${runAttemptCount + 1})" else "Workflow began")
        return try {
            val steps = JSONArray(inputData.getString("steps") ?: "[]")
            for (i in start until steps.length()) {
                if (isStopped) return Result.failure()
                val s = steps.getJSONObject(i)
                val type = s.optString("type")
                history.log(workId, label, "STEP", "Step ${i + 1}/${steps.length()}: $type")
                when (type) {
                    "note" -> { /* retained as an execution checkpoint */ }
                    "delay" -> Thread.sleep(s.optInt("seconds", 1).coerceIn(1, 60) * 1000L)
                    "notify" -> ForgeNotifications.show(applicationContext, s.optString("text", "Forge workflow step completed"))
                    "webhook" -> postWebhook(s)
                    else -> throw PermanentStepException("Unsupported step: $type")
                }
                progress.edit().putInt(key, i + 1).apply()
                setProgressAsync(androidx.work.workDataOf("step" to i + 1, "total" to steps.length()))
            }
            progress.edit().remove(key).apply()
            history.log(workId, label, "SUCCEEDED", "Workflow completed")
            Result.success()
        } catch (e: InterruptedException) {
            history.log(workId, label, "INTERRUPTED", e.message ?: "Interrupted; will resume at the unfinished step")
            Result.retry()
        } catch (e: Exception) {
            if (ForgePolicy.shouldRetry(e, runAttemptCount)) {
                history.log(workId, label, "RETRYING", "${e.message ?: "Execution error"} (attempt ${runAttemptCount + 1} of ${ForgePolicy.MAX_ATTEMPTS})")
                Result.retry()
            } else {
                progress.edit().remove(key).apply()
                history.log(workId, label, "FAILED", (e.message ?: "Execution error") + if (ForgePolicy.isPermanent(e)) " (not retried: it can't succeed as written)" else " (gave up after ${ForgePolicy.MAX_ATTEMPTS} attempts)")
                Result.failure()
            }
        }
    }

    private fun postWebhook(s: JSONObject) {
        val url = s.getString("url")
        ForgePolicy.webhookUrlProblem(url)?.let { throw PermanentStepException(it) }      // checked again here, not only at enqueue
        val parsed = URL(url)
        val addresses = InetAddress.getAllByName(parsed.host)
        if (addresses.isEmpty() || !addresses.all { ForgePolicy.isPublicAddress(it) }) {
            throw PermanentStepException("Webhook host ${parsed.host} resolves to a private or local address")
        }
        val conn = parsed.openConnection() as HttpURLConnection
        try {
            conn.instanceFollowRedirects = false                                          // a redirect could point past the checks above
            conn.requestMethod = "POST"
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(s.optString("body", "{}").toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code !in 200..299) throw WebhookHttpException(code)
        } finally { conn.disconnect() }
    }
}
