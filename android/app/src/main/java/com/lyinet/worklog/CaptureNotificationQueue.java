package com.lyinet.worklog;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

final class CaptureNotificationQueue {
    static final class DrainResult {
        final JSONArray entries;
        final long dropped;

        DrainResult(JSONArray entries, long dropped) {
            this.entries = entries;
            this.dropped = dropped;
        }
    }

    static final String PREFERENCES = "capture_notification";
    private static final String PENDING = "pending_entries";
    private static final String IN_FLIGHT = "in_flight_entries";
    private static final String DROPPED = "dropped_entries";
    private static final int LIMIT = 200;
    private static String claimedBy;

    private CaptureNotificationQueue() {}

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static JSONArray read(SharedPreferences preferences, String key) {
        try {
            return new JSONArray(preferences.getString(key, "[]"));
        } catch (JSONException cause) {
            throw new IllegalStateException("通知记录读取失败", cause);
        }
    }

    private static void commit(SharedPreferences.Editor editor) {
        if (!editor.commit()) throw new IllegalStateException("通知记录保存失败");
    }

    static synchronized void setEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = preferences(context).edit().putBoolean("enabled", enabled);
        if (!enabled) editor.remove(PENDING).remove(IN_FLIGHT).remove(DROPPED);
        commit(editor);
        if (!enabled) claimedBy = null;
    }

    static synchronized boolean append(Context context, String text, long createdAt) {
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean("enabled", false) || isBlank(text)) return false;
        JSONArray entries = read(preferences, PENDING);
        try {
            JSONObject entry = new JSONObject();
            entry.put("id", "notification-" + UUID.randomUUID());
            entry.put("text", text);
            entry.put("createdAt", createdAt);
            entries.put(entry);
            int dropped = 0;
            while (entries.length() > LIMIT) {
                entries.remove(0);
                dropped++;
            }
            long totalDropped = preferences.getLong(DROPPED, 0) + dropped;
            commit(preferences.edit().putString(PENDING, entries.toString()).putLong(DROPPED, totalDropped));
            if (dropped > 0) Log.w("CaptureNotification", "待入库队列已满，丢弃最旧 " + dropped + " 条");
            return true;
        } catch (JSONException cause) {
            throw new IllegalStateException("通知记录保存失败", cause);
        }
    }

    private static boolean isBlank(String text) {
        for (int offset = 0; offset < text.length();) {
            int codePoint = text.codePointAt(offset);
            boolean whitespace = (codePoint >= 0x0009 && codePoint <= 0x000d)
                || codePoint == 0x0020 || codePoint == 0x00a0 || codePoint == 0x1680
                || (codePoint >= 0x2000 && codePoint <= 0x200a)
                || codePoint == 0x2028 || codePoint == 0x2029 || codePoint == 0x202f
                || codePoint == 0x205f || codePoint == 0x3000 || codePoint == 0xfeff;
            if (!whitespace) {
                return false;
            }
            offset += Character.charCount(codePoint);
        }
        return true;
    }

    static synchronized DrainResult drain(Context context, String owner) {
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean("enabled", false)) return new DrainResult(new JSONArray(), 0);
        if (claimedBy != null) return new DrainResult(new JSONArray(), 0);
        JSONArray inFlight = read(preferences, IN_FLIGHT);
        if (inFlight.length() > 0) {
            claimedBy = owner;
            return new DrainResult(inFlight, 0);
        }
        JSONArray pending = read(preferences, PENDING);
        long dropped = preferences.getLong(DROPPED, 0);
        if (pending.length() > 0) {
            commit(preferences.edit().remove(PENDING).putString(IN_FLIGHT, pending.toString()).remove(DROPPED));
            claimedBy = owner;
        } else if (dropped > 0) {
            commit(preferences.edit().remove(DROPPED));
        }
        return new DrainResult(pending, dropped);
    }

    static synchronized void acknowledge(Context context, String owner, JSONArray ids) {
        if (!owner.equals(claimedBy)) throw new IllegalStateException("通知记录领取已失效");
        Set<String> acknowledged = new HashSet<>();
        for (int index = 0; index < ids.length(); index++) {
            String id = ids.optString(index, "");
            if (!id.isEmpty()) acknowledged.add(id);
        }
        SharedPreferences preferences = preferences(context);
        JSONArray remaining = new JSONArray();
        JSONArray inFlight = read(preferences, IN_FLIGHT);
        for (int index = 0; index < inFlight.length(); index++) {
            JSONObject entry = inFlight.optJSONObject(index);
            if (entry == null || !acknowledged.contains(entry.optString("id"))) {
                remaining.put(inFlight.opt(index));
            }
        }
        commit(preferences.edit().putString(IN_FLIGHT, remaining.toString()));
    }

    static synchronized void release(String owner) {
        if (owner.equals(claimedBy)) claimedBy = null;
    }

    static synchronized int count(Context context) {
        SharedPreferences preferences = preferences(context);
        return read(preferences, PENDING).length() + read(preferences, IN_FLIGHT).length();
    }

    static synchronized long dropped(Context context) {
        return preferences(context).getLong(DROPPED, 0);
    }
}
