/**
 * Video Subsystem API Client (Supabase)
 * Handles series, episodes, subtitles, watch progress, and admin permissions.
 */

import { supabase } from '../supabaseClient.js';

let activeSupabase = supabase;

export function setSupabaseForTesting(client) {
  activeSupabase = client;
}

/**
 * Check if the current user has video admin permissions.
 * Verifies app_metadata role or queries video_admins table.
 */
export async function checkIsVideoAdmin() {
  try {
    const { data: { user } } = await activeSupabase.auth.getUser();
    if (!user) return false;

    if (user.app_metadata?.role === 'admin') return true;

    const { data, error } = await activeSupabase
      .from('video_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[VideoApi] checkIsVideoAdmin error:', error);
      return false;
    }

    return Boolean(data);
  } catch (err) {
    console.warn('[VideoApi] checkIsVideoAdmin exception:', err);
    return false;
  }
}

/**
 * Fetch list of video series.
 * @param {Object} options
 * @param {string} [options.search] Search query for title
 * @param {string} [options.genre] Filter by genre
 * @param {string} [options.status] Filter by status ('ongoing', 'completed', 'upcoming')
 * @param {boolean} [options.includeUnpublished] Whether to include unpublished series (requires admin)
 */
export async function fetchVideoSeriesList({ search = '', genre = '', status = '', includeUnpublished = false } = {}) {
  let query = activeSupabase
    .from('video_series')
    .select(`
      id,
      title,
      description,
      poster_key,
      genres,
      status,
      published,
      created_at,
      updated_at
    `)
    .order('updated_at', { ascending: false });

  if (!includeUnpublished) {
    query = query.eq('published', true);
  }

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (genre && genre !== 'all') {
    query = query.contains('genres', [genre]);
  }

  if (search && search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch a single video series by ID.
 */
export async function fetchVideoSeriesById(seriesId) {
  if (!seriesId) return null;

  const { data, error } = await activeSupabase
    .from('video_series')
    .select(`
      id,
      title,
      description,
      poster_key,
      genres,
      status,
      published,
      created_at,
      updated_at
    `)
    .eq('id', seriesId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetch episodes for a series, ordered by episode_number ascending.
 * @param {string} seriesId
 * @param {boolean} [includeUnpublished=false]
 */
export async function fetchEpisodesBySeriesId(seriesId, includeUnpublished = false) {
  if (!seriesId) return [];

  let query = activeSupabase
    .from('video_episodes')
    .select(`
      id,
      series_id,
      episode_number,
      title,
      description,
      r2_key,
      file_size,
      duration_seconds,
      mime_type,
      upload_status,
      published,
      created_at,
      updated_at
    `)
    .eq('series_id', seriesId)
    .order('episode_number', { ascending: true });

  if (!includeUnpublished) {
    query = query.eq('published', true).eq('upload_status', 'ready');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch a single episode by ID.
 */
export async function fetchEpisodeById(seriesId, episodeId) {
  if (!seriesId || !episodeId) return null;

  const { data, error } = await activeSupabase
    .from('video_episodes')
    .select(`
      id,
      series_id,
      episode_number,
      title,
      description,
      r2_key,
      file_size,
      duration_seconds,
      mime_type,
      upload_status,
      published,
      created_at,
      updated_at
    `)
    .eq('series_id', seriesId)
    .eq('id', episodeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetch subtitles for an episode.
 */
export async function fetchSubtitlesByEpisode(episodeId) {
  if (!episodeId) return [];

  const { data, error } = await activeSupabase
    .from('video_subtitles')
    .select('id, series_id, episode_id, language_code, label, r2_key, is_default, created_at')
    .eq('episode_id', episodeId)
    .order('is_default', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * ADMIN: Create a new video series.
 */
export async function createVideoSeries({ title, description = '', genres = [], status = 'ongoing', published = false, poster_key = null }) {
  const { data, error } = await activeSupabase
    .from('video_series')
    .insert({
      title,
      description,
      genres,
      status,
      published,
      poster_key,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * ADMIN: Update series metadata.
 */
export async function updateVideoSeries(seriesId, updates) {
  const { data, error } = await activeSupabase
    .from('video_series')
    .update(updates)
    .eq('id', seriesId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * ADMIN: Delete a video series.
 */
export async function deleteVideoSeries(seriesId) {
  const { error } = await activeSupabase
    .from('video_series')
    .delete()
    .eq('id', seriesId);

  if (error) throw error;
  return true;
}

/**
 * ADMIN: Safely delete video series: deletes R2 media first, only then removes DB row.
 */
export async function deleteVideoSeriesEverywhere(seriesId) {
  const { deleteSeriesMedia } = await import('./videoCloud.js');
  await deleteSeriesMedia(seriesId);
  return deleteVideoSeries(seriesId);
}

/**
 * ADMIN: Create a new episode shell.
 */
export async function createVideoEpisode({ seriesId, episodeNumber, title, description = '', mimeType = 'video/mp4', published = false }) {
  const tempKey = `videos/${seriesId}/pending/source.mp4`;
  const { data, error } = await activeSupabase
    .from('video_episodes')
    .insert({
      series_id: seriesId,
      episode_number: episodeNumber,
      title,
      description,
      r2_key: tempKey,
      upload_status: 'pending',
      published,
      mime_type: mimeType,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * ADMIN: Prepare an episode shell for upload.
 * If an episode with (series_id, episode_number) already exists:
 * - If already 'ready': throws error to prevent accidental overwrite.
 * - If 'pending', 'failed', or 'uploading': reuses and updates the shell, allowing clean retries
 *   without triggering unique constraint violation 'uq_series_episode'.
 * If it does not exist: inserts a new row.
 */
export async function prepareVideoEpisodeForUpload({
  seriesId,
  episodeNumber,
  title,
  description = '',
  mimeType = 'video/mp4',
  published = false,
}) {
  const tempKey = `videos/${seriesId}/pending/source.mp4`;

  const { data: existing, error: findErr } = await activeSupabase
    .from('video_episodes')
    .select('id, upload_status')
    .eq('series_id', seriesId)
    .eq('episode_number', episodeNumber)
    .maybeSingle();

  if (findErr) throw findErr;

  if (existing) {
    if (existing.upload_status === 'ready') {
      throw new Error(`Tập ${episodeNumber} đã tồn tại và đã tải lên hoàn tất. Vui lòng chọn số tập khác.`);
    }

    // Reuse and update the unready episode for retry
    const { data: updated, error: updateErr } = await activeSupabase
      .from('video_episodes')
      .update({
        title,
        description,
        r2_key: tempKey,
        upload_status: 'pending',
        published,
        mime_type: mimeType,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    return updated;
  }

  return createVideoEpisode({
    seriesId,
    episodeNumber,
    title,
    description,
    mimeType,
    published,
  });
}

/**
 * ADMIN: Update episode metadata.
 */
export async function updateVideoEpisode(seriesId, episodeId, updates) {
  const { data, error } = await activeSupabase
    .from('video_episodes')
    .update(updates)
    .eq('series_id', seriesId)
    .eq('id', episodeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * ADMIN: Delete an episode.
 */
export async function deleteVideoEpisode(seriesId, episodeId) {
  const { error } = await activeSupabase
    .from('video_episodes')
    .delete()
    .eq('series_id', seriesId)
    .eq('id', episodeId);

  if (error) throw error;
  return true;
}

/**
 * ADMIN: Safely delete episode: deletes R2 media first, only then removes DB row.
 */
export async function deleteVideoEpisodeEverywhere(seriesId, episodeId) {
  const { deleteEpisodeMedia } = await import('./videoCloud.js');
  await deleteEpisodeMedia(seriesId, episodeId);
  return deleteVideoEpisode(seriesId, episodeId);
}

/**
 * ADMIN: Add a subtitle track.
 */
export async function addVideoSubtitle({ seriesId, episodeId, languageCode = 'vi', label = 'Tiếng Việt', r2Key, isDefault = true }) {
  const { data, error } = await activeSupabase
    .from('video_subtitles')
    .insert({
      series_id: seriesId,
      episode_id: episodeId,
      language_code: languageCode,
      label,
      r2_key: r2Key,
      is_default: isDefault,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * ADMIN: Delete a subtitle track.
 */
export async function deleteVideoSubtitle(subtitleId) {
  const { error } = await activeSupabase
    .from('video_subtitles')
    .delete()
    .eq('id', subtitleId);

  if (error) throw error;
  return true;
}
