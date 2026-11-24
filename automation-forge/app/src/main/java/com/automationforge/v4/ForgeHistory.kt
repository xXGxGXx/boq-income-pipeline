package com.automationforge.v4

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

class ForgeHistory(context: Context) : SQLiteOpenHelper(context, "forge_history.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, work_id TEXT NOT NULL, label TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, timestamp INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX events_work_id ON events(work_id)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}
    fun log(workId: String, label: String, event: String, detail: String = "") {
        val values = ContentValues().apply { put("work_id", workId); put("label", label); put("event", event); put("detail", detail.take(500)); put("timestamp", System.currentTimeMillis()) }
        writableDatabase.insert("events", null, values)
    }
    fun recent(limit: Int = 100): JSONArray {
        val arr = JSONArray(); readableDatabase.query("events", arrayOf("work_id","label","event","detail","timestamp"), null, null, null, null, "timestamp DESC", limit.toString()).use { c ->
            while(c.moveToNext()) arr.put(JSONObject().put("workId",c.getString(0)).put("label",c.getString(1)).put("event",c.getString(2)).put("detail",c.getString(3)).put("timestamp",c.getLong(4)))
        }; return arr
    }
    fun clear() { writableDatabase.delete("events", null, null) }
}
