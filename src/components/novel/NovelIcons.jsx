import React from 'react';

/**
 * NovelIcons.jsx
 * Bộ biểu tượng SVG inline thống nhất cho phân hệ Truyện Chữ ("Thư Viện Mực Đêm").
 * Quy chuẩn: stroke="currentColor", strokeWidth="1.75", strokeLinecap="round", strokeLinejoin="round", fill="none".
 * Tuyệt đối không dùng emoji trong giao diện truyện chữ.
 */

const baseProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 1.75,
  stroke: 'currentColor',
};

export function IconSearch({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconLock({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconEye({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconGrid({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconList({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export function IconPlus({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconPlay({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function IconRewind({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polygon points="11 19 2 12 11 5 11 19" />
      <polygon points="22 19 13 12 22 5 22 19" />
    </svg>
  );
}

export function IconDownload({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconEdit({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconTrash({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function IconMoreVertical({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

export function IconClose({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

export function IconSort({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="m21 8-4-4-4 4" />
      <path d="M17 4v16" />
    </svg>
  );
}

export function IconReplace({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

export function IconBook({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function IconZap({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function IconChevronDown({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconChevronUp({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function IconTools({ size = 18, className = '', title, ...props }) {
  return (
    <svg width={size} height={size} {...baseProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'} {...props}>
      {title && <title>{title}</title>}
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
