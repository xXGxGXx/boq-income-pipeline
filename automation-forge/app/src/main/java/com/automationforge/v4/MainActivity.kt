package com.automationforge.v4

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var web: WebView
    companion object { private const val PICK_JSON = 401 }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.allowFileAccessFromFileURLs = false
        web.settings.allowUniversalAccessFromFileURLs = false
        web.settings.setSupportMultipleWindows(false)
        web.settings.javaScriptCanOpenWindowsAutomatically = false
        web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.webViewClient = BundledPageClient()
        web.addJavascriptInterface(ForgeBridge(this), "ForgeNative")
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }
    fun pickJson() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE); type = "application/json"; putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/json", "text/plain"))
        }
        startActivityForResult(intent, PICK_JSON)
    }
    @Deprecated("Activity result kept for compatibility with minimum SDK")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK_JSON && resultCode == RESULT_OK && data?.data != null) {
            val uri = data.data!!
            try {
                contentResolver.openInputStream(uri)?.use { stream ->
                    val text = BoundedImportReader.readUtf8(stream)
                    val safe = JSONObject().put("content", text).toString()
                    web.evaluateJavascript("window.ForgeImportFile && window.ForgeImportFile(${JSONObject.quote(safe)});", null)
                } ?: throw IllegalStateException("Unable to read selected file")
            } catch (e: Exception) {
                web.evaluateJavascript("window.ForgeImportError && window.ForgeImportError(${JSONObject.quote(e.message ?: "Read failed")});", null)
            }
        }
    }
    override fun onBackPressed() { super.onBackPressed() }
}

private class BundledPageClient : WebViewClient() {
    private fun allowed(url: String?) = url == "file:///android_asset/index.html"
    private fun isLocalAsset(url: android.net.Uri): Boolean {
        val path = url.path ?: return false
        return url.scheme == "file" && url.host == "android_asset" &&
            path.startsWith("/") && !path.split("/").contains("..") && path != "/"
    }
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (isLocalAsset(request.url)) return super.shouldInterceptRequest(view, request)
        return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
    }
    override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
        return !allowed(request.url?.toString())
    }
    @Deprecated("Needed for older WebView")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = !allowed(url)
    override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
        if (!allowed(url)) view.stopLoading() else super.onPageStarted(view, url, favicon)
    }
}

class ForgeBridge(private val activity: MainActivity) {
    private val wm get() = WorkManager.getInstance(activity)
    private fun normalizeWorkflow(raw: String): JSONArray {
        val payload = JSONObject(raw); val steps = payload.optJSONArray("steps") ?: JSONArray()
        require(steps.length() in 1..30) { "Workflow must contain 1–30 steps" }
        val normalized = JSONArray()
        for (i in 0 until steps.length()) {
            val s = steps.getJSONObject(i); val type = s.optString("type")
            require(type != "webhook") { "Webhook steps are disabled until the connection can pin the resolved address" }
            require(type in setOf("note", "delay", "notify")) { "Unsupported step: $type" }
            val step = JSONObject().put("type", type)
            when (type) {
                "note" -> step.put("text", s.optString("text").take(500))
                "delay" -> step.put("seconds", s.optInt("seconds", 1).coerceIn(1, 60))
                "notify" -> step.put("text", s.optString("text").take(200))
            }; normalized.put(step)
        }
        val waits = (0 until normalized.length()).map { normalized.getJSONObject(it) }.filter { it.getString("type") == "delay" }.map { it.getInt("seconds") }
        require(ForgePolicy.totalDelaySeconds(waits) <= ForgePolicy.MAX_TOTAL_DELAY_SECONDS) { "Workflow waits too long for one background run (at most ${ForgePolicy.MAX_TOTAL_DELAY_SECONDS / 60} minutes of delays in total)" }
        return normalized
    }
    private fun oneTime(steps: JSONArray): OneTimeWorkRequest = OneTimeWorkRequestBuilder<ForgeWorker>()
        .setInputData(workDataOf("steps" to steps.toString(), "label" to "Manual workflow"))
        .addTag("forge_native").addTag("forge_label:Manual workflow").setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS).build()
    @android.webkit.JavascriptInterface fun enqueueWorkflow(workflowJson: String): String = try { val steps=normalizeWorkflow(workflowJson); wm.enqueue(oneTime(steps)); "queued" } catch(e:Exception){ "error: ${e.message ?: "invalid workflow"}" }
    @android.webkit.JavascriptInterface fun scheduleWorkflow(workflowJson: String, minutes: Int, scheduleName: String): String = try {
        val steps=normalizeWorkflow(workflowJson); val interval=minutes.coerceIn(15, 10080); val name="forge_repeat_" + scheduleName.replace(Regex("[^A-Za-z0-9_-]"), "_").take(36)
        val req=PeriodicWorkRequestBuilder<ForgeWorker>(interval.toLong(), TimeUnit.MINUTES).setInputData(workDataOf("steps" to steps.toString(), "label" to scheduleName.take(60), "intervalMinutes" to interval)).addTag("forge_schedule").addTag("forge_native").addTag("forge_label:" + scheduleName.take(60)).build()
        wm.enqueueUniquePeriodicWork(name, ExistingPeriodicWorkPolicy.UPDATE, req); "scheduled:$interval:$name"
    } catch(e:Exception){ "error: ${e.message ?: "invalid schedule"}" }
    @android.webkit.JavascriptInterface fun listJobs(): String {
        val out=JSONArray(); try { wm.getWorkInfosByTag("forge_native").get().forEach { info ->
            // WorkInfo does not expose a job's input data: the interval comes from periodicityInfo, the label from a tag set at enqueue
            val minutes = ((info.periodicityInfo?.repeatIntervalMillis ?: 0L) / 60000L).toInt()
            val label = info.tags.firstOrNull { it.startsWith("forge_label:") }?.removePrefix("forge_label:") ?: "Native workflow"
            out.put(JSONObject().put("id",info.id.toString()).put("state",info.state.name).put("periodic",minutes>0).put("intervalMinutes",minutes).put("label",label).put("tags",JSONArray(info.tags.filterNot { it.startsWith("forge_label:") })))
        } } catch(e:Exception) { return JSONObject().put("error",e.message ?: "history unavailable").toString() }; return out.toString()
    }
    @android.webkit.JavascriptInterface fun cancelJob(id: String): String = try { wm.cancelWorkById(java.util.UUID.fromString(id)); "cancelled" } catch(e:Exception){ "error: ${e.message ?: "invalid job id"}" }
    @android.webkit.JavascriptInterface fun getExecutionHistory(): String = try { ForgeHistory(activity).recent(150).toString() } catch(e:Exception) { JSONArray().toString() }
    @android.webkit.JavascriptInterface fun clearExecutionHistory(): String = try { ForgeHistory(activity).clear(); "cleared" } catch(e:Exception) { "error: ${e.message ?: "clear failed"}" }
    @android.webkit.JavascriptInterface fun openJsonPicker(): String { activity.runOnUiThread { activity.pickJson() }; return "picker_opened" }
}
