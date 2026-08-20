import { useState, useCallback } from 'react';
import { getReadingSettings, saveReadingSettings } from '../lib/storage';

export const READING_THEMES = {
  paper: {
    id: 'paper',
    label: 'Giấy',
    bg: '#f6f1e8',
    text: '#3a291c',
    accent: '#8c6b16',
  },
  white: {
    id: 'white',
    label: 'Trắng',
    bg: '#ffffff',
    text: '#1a1a1a',
    accent: '#555555',
  },
  dark: {
    id: 'dark',
    label: 'Tối',
    bg: '#1d2738',
    text: '#e2ecf7',
    accent: '#8ec9eb',
  },
  black: {
    id: 'black',
    label: 'Đen',
    bg: '#121212',
    text: '#c8c8c8',
    accent: '#999999',
  },
  night: {
    id: 'night',
    label: 'Xanh đêm',
    bg: '#15253b',
    text: '#cfe0f0',
    accent: '#6ec2e5',
  },
  forest: {
    id: 'forest',
    label: 'Rừng',
    bg: '#1d2719',
    text: '#d2e4bc',
    accent: '#89b265',
  },
};

export const FONT_OPTIONS = [
  { id: 'be-vietnam', label: 'Be Vietnam Pro', css: "'Be Vietnam Pro', sans-serif" },
  { id: 'serif', label: 'Serif', css: "'Noto Serif', Georgia, serif" },
  { id: 'sans', label: 'Sans', css: "'Noto Sans', system-ui, sans-serif" },
  { id: 'mono', label: 'Mono', css: "'Courier New', monospace" },
];

export function useReadingSettings() {
  const [settings, setSettingsState] = useState(() => getReadingSettings());

  const updateSettings = useCallback((updates) => {
    setSettingsState(prev => {
      const next = { ...prev, ...updates };
      saveReadingSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings, READING_THEMES, FONT_OPTIONS };
}
