/**
 * Reading Position Anchor & Font Reflow Realignment Engine
 * Guarantees that changing font families (or font sizes) does not shift
 * or reset the reader's active reading paragraph.
 */

const READING_LINE_OFFSET = 70; // 70px below viewport top (under top bar)

/**
 * Capture the paragraph currently in the reader's viewport focal area
 * along with its exact relative offset from the reading line.
 * Must be called BEFORE or at the start of a reflow.
 */
export function getReadingAnchor(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return { paraIndex: 0, offsetY: 0, scrollY: 0 };

  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const currentScrollY = win ? win.scrollY : 0;
  const innerHeight = win ? win.innerHeight : 800;
  const scrollHeight = doc.documentElement ? doc.documentElement.scrollHeight : 1000;
  const maxScroll = Math.max(1, scrollHeight - innerHeight);

  const paraEls = doc.querySelectorAll('[data-para-index]');
  if (!paraEls || paraEls.length === 0) {
    return { paraIndex: 0, offsetY: 0, scrollY: currentScrollY };
  }

  // 1. Check if user is scrolled to the very bottom of the chapter
  if (currentScrollY >= maxScroll - 60) {
    const lastIdx = paraEls.length - 1;
    const lastRect = paraEls[lastIdx].getBoundingClientRect();
    return {
      paraIndex: lastIdx,
      offsetY: READING_LINE_OFFSET - lastRect.top,
      scrollY: currentScrollY,
      isNearBottom: true,
    };
  }

  // 2. Primary: Find paragraph crossing or resting at reading line (top 60px..140px)
  for (let i = 0; i < paraEls.length; i++) {
    const rect = paraEls[i].getBoundingClientRect();
    if (rect.bottom >= 60 && rect.top <= 140) {
      return {
        paraIndex: i,
        offsetY: READING_LINE_OFFSET - rect.top,
        scrollY: currentScrollY,
      };
    }
  }

  // 3. Fallback: First paragraph starting below 60px
  for (let i = 0; i < paraEls.length; i++) {
    const rect = paraEls[i].getBoundingClientRect();
    if (rect.top >= 60) {
      const idx = Math.max(0, i - 1);
      const prevRect = paraEls[idx].getBoundingClientRect();
      return {
        paraIndex: idx,
        offsetY: READING_LINE_OFFSET - prevRect.top,
        scrollY: currentScrollY,
      };
    }
  }

  return {
    paraIndex: 0,
    offsetY: 0,
    scrollY: currentScrollY,
  };
}

/**
 * Calculate the target scrollY needed to align an anchor paragraph
 * exactly back to its pre-reflow focal position.
 */
export function calculateTargetScrollY(rectTop, currentScrollY, offsetY = 0, lineOffset = READING_LINE_OFFSET) {
  // rectTop is paragraph's current viewport top
  // target paragraph top should be: lineOffset - offsetY
  // delta to scroll = rectTop - (lineOffset - offsetY)
  return Math.max(0, Math.round(currentScrollY + rectTop - (lineOffset - offsetY)));
}

/**
 * Restores the window scroll position to match the captured reading anchor.
 * Returns the restored target scrollY, or null if target element not found.
 */
export function restoreReadingAnchor(anchor, doc = typeof document !== 'undefined' ? document : null) {
  if (!anchor || typeof anchor.paraIndex !== 'number' || !doc) return null;

  const targetPara = doc.getElementById(`para-${anchor.paraIndex}`);
  if (!targetPara) return null;

  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const currentScrollY = win ? win.scrollY : 0;
  const rect = targetPara.getBoundingClientRect();
  const targetY = calculateTargetScrollY(rect.top, currentScrollY, anchor.offsetY);

  if (win && typeof win.scrollTo === 'function') {
    win.scrollTo({ top: targetY, behavior: 'instant' });
  }

  return targetY;
}

/**
 * Coordinator class managing font reflow sessions.
 * Handles:
 * - Pre-change anchor capture
 * - Canceling stale realignment on rapid font changes or chapter switch
 * - User active scroll detection (avoids forcing scroll if user deliberately scrolls during font load)
 * - Safe font-ready and multi-pass timer realignments
 */
export class FontChangeCoordinator {
  constructor({ onRealigned, onSessionEnd } = {}) {
    this.currentSessionId = 0;
    this.scheduledSessionId = null;
    this.activeAnchor = null;
    this.userHasScrolled = false;
    this.lastTargetY = null;
    this.timers = [];
    this.onRealigned = onRealigned;
    this.onSessionEnd = onSessionEnd;
  }

  _clearTimers() {
    for (const t of this.timers) {
      clearTimeout(t);
    }
    this.timers = [];
  }

  /**
   * Must be called right before applying font update.
   * Invalidates any previous session timers/promises and captures pre-reflow anchor.
   */
  prepare(doc = typeof document !== 'undefined' ? document : null) {
    this._clearTimers();
    this.currentSessionId++;
    this.scheduledSessionId = null;
    this.userHasScrolled = false;
    this.lastTargetY = null;
    this.activeAnchor = getReadingAnchor(doc);
    return this.activeAnchor;
  }

  /**
   * Signal user engagement/scroll. If user deliberately scrolls, abort realignment
   */
  handleUserScroll(newScrollY) {
    if (!this.activeAnchor) return;
    // If scroll moved significantly away from last restored target (> 45px), user actively scrolled
    if (this.lastTargetY !== null && Math.abs(newScrollY - this.lastTargetY) > 45) {
      this.userHasScrolled = true;
      this.cancel();
    }
  }

  /**
   * Execute realignment for the active session
   */
  realign(doc = typeof document !== 'undefined' ? document : null, expectedSessionId = null) {
    if (!this.activeAnchor || this.userHasScrolled) return null;
    if (expectedSessionId !== null && expectedSessionId !== this.currentSessionId) return null;

    const targetY = restoreReadingAnchor(this.activeAnchor, doc);
    if (targetY !== null) {
      this.lastTargetY = targetY;
      if (typeof this.onRealigned === 'function') {
        this.onRealigned({
          targetY,
          paraIndex: this.activeAnchor.paraIndex,
          offsetY: this.activeAnchor.offsetY,
          sessionId: this.currentSessionId,
        });
      }
    }
    return targetY;
  }

  /**
   * Schedule multi-pass realignment and bind to document.fonts.ready.
   * Returns the sessionId bound to this scheduling pass.
   */
  scheduleRealignments(doc = typeof document !== 'undefined' ? document : null) {
    if (!this.activeAnchor || this.userHasScrolled) return null;

    this._clearTimers();
    const sessionId = this.currentSessionId;
    this.scheduledSessionId = sessionId;

    const runIfCurrent = () => {
      if (this.currentSessionId === sessionId && !this.userHasScrolled && this.activeAnchor) {
        return this.realign(doc, sessionId);
      }
      return null;
    };

    // Immediate pass
    runIfCurrent();

    // Bind to fonts.ready promise (guarded by sessionId so stale promises cannot interfere)
    if (doc?.fonts?.ready) {
      doc.fonts.ready.then(() => {
        runIfCurrent();
      }).catch(() => {});
    }

    // Fallback timer passes for slow network or variable font reflows
    const delays = [60, 160, 320, 500];
    for (const delay of delays) {
      const timer = setTimeout(() => {
        runIfCurrent();
        if (delay === delays[delays.length - 1] && this.currentSessionId === sessionId) {
          if (typeof this.onSessionEnd === 'function') {
            this.onSessionEnd();
          }
        }
      }, delay);
      this.timers.push(timer);
    }

    return sessionId;
  }

  /**
   * Cancel pending realignment timers and invalidate session.
   * When sessionId is provided (e.g. React effect cleanup), ONLY cancels if that
   * sessionId is still the current active session — so stale cleanups never wipe
   * out a newer font change's pre-reflow anchor.
   */
  cancel(sessionId = null) {
    if (sessionId !== null && sessionId !== undefined && sessionId !== this.currentSessionId) {
      return false;
    }
    this._clearTimers();
    this.currentSessionId++;
    this.scheduledSessionId = null;
    this.activeAnchor = null;
    this.lastTargetY = null;
    return true;
  }
}
