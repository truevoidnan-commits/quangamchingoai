import React from 'react';

/**
 * ComicIcons.jsx
 * Bộ biểu tượng SVG inline thống nhất cho phân hệ Truyện Tranh (Phase 3).
 * Quy chuẩn: stroke="currentColor", strokeWidth="1.75", strokeLinecap="round", strokeLinejoin="round", fill="none".
 * Tuyệt đối không dùng emoji trong giao diện truyện tranh.
 */

const baseProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 1.75,
  stroke: 'currentColor',
};

export function IconCloud({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

export function IconCloudCheck({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 4.5 4.5" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

export function IconCloudUpload({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 4.5 4.5" />
      <path d="M12 12v6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  );
}

export function IconCloudDownload({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 4.5 4.5" />
      <path d="M12 11v7" />
      <path d="m9 15 3 3 3-3" />
    </svg>
  );
}

export function IconCloudOff({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 2.5-8.24" />
      <path d="M15.71 10.29A7.002 7.002 0 0 0 10.3 5.06" />
    </svg>
  );
}

export function IconDevice({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function IconBook({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
    </svg>
  );
}

export function IconBookOpen({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function IconDotsVertical({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconTrash({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

export function IconEdit({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function IconAlertTriangle({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

export function IconAlertCircle({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

export function IconPlay({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function IconPause({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function IconX({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function IconArrowLeft({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function IconChevronLeft({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconScroll({ size = 18, className = '', title, ...props }) {
  // Cuộn dọc: biểu tượng thể hiện trang dài cuộn từ trên xuống
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect width="12" height="20" x="6" y="2" rx="2" />
      <path d="M12 6v12" />
      <path d="m9 15 3 3 3-3" />
    </svg>
  );
}

export function IconPages({ size = 18, className = '', title, ...props }) {
  // Từng trang: biểu tượng lật 2 trang ngang (manga / sách)
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect width="18" height="14" x="3" y="5" rx="2" />
      <path d="M12 5v14" />
      <path d="m14 10 2 2-2 2" />
    </svg>
  );
}

export function IconClock({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function IconRefresh({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconCheck({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconUpload({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

export function IconHardDrive({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <line x1="22" x2="2" y1="12" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" x2="6.01" y1="16" y2="16" />
      <line x1="10" x2="10.01" y1="16" y2="16" />
    </svg>
  );
}


export function IconFolder({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
