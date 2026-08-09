import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'nebula_build_chat_w_v1';
const CHAT_MIN = 260;
const CHAT_MAX = 560;
const CHAT_DEFAULT = 360;

function readStoredChatWidth(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(n)) return Math.min(CHAT_MAX, Math.max(CHAT_MIN, n));
  } catch {
    /* ignore */
  }
  return CHAT_DEFAULT;
}

/** Horizontal resize: preview grows when chat width shrinks. */
export function useChatPreviewSplit() {
  const [chatWidth, setChatWidth] = useState(readStoredChatWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(CHAT_DEFAULT);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = chatWidth;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        // Dragging handle left → chat wider; right → chat narrower (preview larger).
        const delta = startX.current - ev.clientX;
        const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startW.current + delta));
        setChatWidth(next);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setChatWidth((current) => {
          try {
            localStorage.setItem(STORAGE_KEY, String(current));
          } catch {
            /* ignore */
          }
          return current;
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [chatWidth],
  );

  useEffect(() => {
    return () => {
      dragging.current = false;
    };
  }, []);

  return { chatWidth, onHandleMouseDown, chatMin: CHAT_MIN, chatMax: CHAT_MAX };
}
