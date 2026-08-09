import { useState, useEffect, useRef } from 'react';
import { countWords, formatWordCount } from '../lib/textFixer';

/**
 * useWordCount — real-time word counter with debounce
 */
export function useWordCount(text, debounceMs = 200) {
  const [wordCount, setWordCount] = useState(() => countWords(text));
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setWordCount(countWords(text));
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, debounceMs]);

  return {
    count: wordCount,
    formatted: formatWordCount(wordCount),
  };
}
