import { useState, useEffect, useCallback } from 'react';

/**
 * Safely read sort order from localStorage.
 * Only accepts 'asc' | 'desc'.
 */
export function getPersistedSort(itemKey, defaultKey = 'tcl:sortDefault') {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (itemKey) {
        const itemVal = window.localStorage.getItem(itemKey);
        if (itemVal === 'asc' || itemVal === 'desc') {
          return itemVal;
        }
      }
      if (defaultKey) {
        const defaultVal = window.localStorage.getItem(defaultKey);
        if (defaultVal === 'asc' || defaultVal === 'desc') {
          return defaultVal;
        }
      }
    }
  } catch {
    // LocalStorage blocked / private mode fallback
  }
  return 'asc';
}

/**
 * Safely remove a persisted sort key on delete.
 */
export function clearPersistedSort(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && key) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore error
  }
}

/**
 * Hook to persist sort order ('asc' | 'desc') per item with global default inheritance.
 *
 * @param {string|null|undefined} itemKey - e.g. `tcl:chapterSort:${novelId}`
 * @param {string} defaultKey - e.g. `tcl:chapterSortDefault`
 * @returns {[ 'asc' | 'desc', (newOrder: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void ]}
 */
export default function usePersistedSort(itemKey, defaultKey = 'tcl:sortDefault') {
  const [sortOrder, setSortOrderState] = useState(() => getPersistedSort(itemKey, defaultKey));

  useEffect(() => {
    setSortOrderState(getPersistedSort(itemKey, defaultKey));
  }, [itemKey, defaultKey]);

  const setSortOrder = useCallback(
    (newOrderOrUpdater) => {
      setSortOrderState((prev) => {
        const resolved =
          typeof newOrderOrUpdater === 'function' ? newOrderOrUpdater(prev) : newOrderOrUpdater;
        const validOrder = resolved === 'desc' ? 'desc' : 'asc';
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            if (itemKey) {
              window.localStorage.setItem(itemKey, validOrder);
            }
            if (defaultKey) {
              window.localStorage.setItem(defaultKey, validOrder);
            }
          }
        } catch {
          // LocalStorage blocked / quota exceeded
        }
        return validOrder;
      });
    },
    [itemKey, defaultKey]
  );

  return [sortOrder, setSortOrder];
}
