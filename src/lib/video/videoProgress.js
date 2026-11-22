/**
 * Video Watch Progress Manager
 * 
 * Provides instantaneous local playback resumption via LocalStorage
 * paired with debounced cloud synchronization to Supabase `video_watch_progress`.
 * Independent of cultivation OCC and comic systems.
 */

import { supabase } from '../supabaseClient.js';

let activeSupabase = supabase;

export function setSupabaseForTesting(client) {
  activeSupabase = client;
}

const LOCAL_STORAGE_PREFIX = 'tcl_video_progress_';
const HISTORY_KEY = 'tcl_video_history';
const MAX_HISTORY_ITEMS = 30;

// Debounce timer map: episodeId -> timer
const syncTimers = new Map();

/**
 * Get saved watch progress for an episode from localStorage.
 */
export function getLocalProgress(episodeId) {
  if (!episodeId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${episodeId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Get all recent watch history from localStorage.
 */
export function getLocalWatchHistory() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save progress locally and update history index.
 */
function saveLocalProgress(seriesId, episodeId, positionSeconds, durationSeconds, completed = false, extraMeta = {}) {
  if (typeof localStorage === 'undefined' || !episodeId) return;

  const entry = {
    seriesId,
    episodeId,
    positionSeconds: Math.max(0, positionSeconds || 0),
    durationSeconds: Math.max(0, durationSeconds || 0),
    completed: Boolean(completed),
    updatedAt: Date.now(),
    seriesTitle: extraMeta.seriesTitle || '',
    episodeTitle: extraMeta.episodeTitle || '',
    episodeNumber: extraMeta.episodeNumber || 1,
    posterKey: extraMeta.posterKey || '',
  };

  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${episodeId}`, JSON.stringify(entry));

    // Update history array
    const history = getLocalWatchHistory();
    const filtered = history.filter((h) => h.episodeId !== episodeId);
    filtered.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY_ITEMS)));
  } catch (err) {
    console.warn('[VideoProgress] LocalStorage save error:', err);
  }

  return entry;
}

/**
 * Sync progress to Supabase `video_watch_progress` table.
 */
async function syncToCloud(seriesId, episodeId, positionSeconds, durationSeconds, completed = false) {
  try {
    const { data: { user } } = await activeSupabase.auth.getUser();
    if (!user) return; // Anonymous user only uses local storage

    const payload = {
      user_id: user.id,
      series_id: seriesId,
      episode_id: episodeId,
      position_seconds: Math.round(positionSeconds),
      duration_seconds: Math.round(durationSeconds),
      completed: Boolean(completed),
      updated_at: new Date().toISOString(),
    };

    await activeSupabase
      .from('video_watch_progress')
      .upsert(payload, { onConflict: 'user_id,episode_id' });
  } catch (err) {
    console.warn('[VideoProgress] Cloud sync failed:', err);
  }
}

/**
 * Record watch progress with intelligent debouncing.
 * - Saves immediately to localStorage.
 * - Flushes to Supabase after 5s or immediately if immediate=true (e.g. pause, seek, unload).
 */
export function recordWatchProgress(seriesId, episodeId, positionSeconds, durationSeconds, { immediate = false, completed = false, extraMeta = {} } = {}) {
  if (!episodeId) return;

  // Mark completed if within 15 seconds of the end or >= 95%
  const isCompleted = completed || (durationSeconds > 0 && (positionSeconds >= durationSeconds - 15 || positionSeconds / durationSeconds >= 0.95));

  // 1. Instant local write
  saveLocalProgress(seriesId, episodeId, positionSeconds, durationSeconds, isCompleted, extraMeta);

  // 2. Debounced or immediate cloud write
  if (syncTimers.has(episodeId)) {
    clearTimeout(syncTimers.get(episodeId));
    syncTimers.delete(episodeId);
  }

  if (immediate) {
    syncToCloud(seriesId, episodeId, positionSeconds, durationSeconds, isCompleted);
  } else {
    const timer = setTimeout(() => {
      syncTimers.delete(episodeId);
      syncToCloud(seriesId, episodeId, positionSeconds, durationSeconds, isCompleted);
    }, 5000);
    syncTimers.set(episodeId, timer);
  }
}

/**
 * Fetch latest progress for an episode, resolving conflicts between Cloud and LocalStorage.
 */
export async function getEffectiveProgress(seriesId, episodeId) {
  const local = getLocalProgress(episodeId);

  try {
    const { data: { user } } = await activeSupabase.auth.getUser();
    if (!user) return local;

    const { data: cloudRow } = await activeSupabase
      .from('video_watch_progress')
      .select('position_seconds, duration_seconds, completed, updated_at')
      .eq('user_id', user.id)
      .eq('episode_id', episodeId)
      .maybeSingle();

    if (!cloudRow) return local;

    const cloudTime = new Date(cloudRow.updated_at).getTime();
    const localTime = local?.updatedAt || 0;

    // Use cloud if newer or if no local
    if (!local || cloudTime > localTime) {
      const merged = {
        seriesId,
        episodeId,
        positionSeconds: Number(cloudRow.position_seconds) || 0,
        durationSeconds: Number(cloudRow.duration_seconds) || 0,
        completed: Boolean(cloudRow.completed),
        updatedAt: cloudTime,
      };
      saveLocalProgress(seriesId, episodeId, merged.positionSeconds, merged.durationSeconds, merged.completed);
      return merged;
    }

    return local;
  } catch (err) {
    console.warn('[VideoProgress] Error getting effective progress:', err);
    return local;
  }
}
