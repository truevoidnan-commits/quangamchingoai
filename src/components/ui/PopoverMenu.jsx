import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './PopoverMenu.module.css';

const ITEM_SEL = 'button:not([disabled]), [role="menuitem"]:not([disabled])';

export default function PopoverMenu({
  isOpen,
  onClose,
  triggerRef,
  children,
  ariaLabel = 'Menu',
  className = '',
  id,
}) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, flipped: false, ready: false });

  const updatePosition = useCallback(() => {
    if (!triggerRef?.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const el = menuRef.current;
    const w = el ? el.offsetWidth : 210;
    const h = el ? el.offsetHeight : 150;

    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;

    const flipped = spaceBelow < h && spaceAbove > spaceBelow;
    const top = flipped
      ? Math.max(8, r.top - h - 6)
      : Math.min(window.innerHeight - h - 8, r.bottom + 6);

    let left = r.right - w;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    if (left < 12) left = 12;

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      flipped,
      ready: true,
    });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setCoords((prev) => ({ ...prev, ready: false }));
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        triggerRef?.current &&
        !triggerRef.current.contains(e.target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      const items = menuRef.current ? Array.from(menuRef.current.querySelectorAll(ITEM_SEL)) : [];
      if (!items.length) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown'
          ? (idx < items.length - 1 ? idx + 1 : 0)
          : (idx > 0 ? idx - 1 : items.length - 1);
        items[next]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === 'Tab') {
        onClose();
      }
    };

    const handleDismiss = () => onClose();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, { passive: true, capture: true });
    window.addEventListener('resize', handleDismiss);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, { capture: true });
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isOpen, onClose, triggerRef]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const first = menuRef.current?.querySelector(ITEM_SEL);
        if (first && !menuRef.current?.contains(document.activeElement)) {
          first.focus();
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={ariaLabel}
      className={`${styles.popoverMenu} ${coords.flipped ? styles.flipped : ''} ${className}`}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        visibility: coords.ready ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
