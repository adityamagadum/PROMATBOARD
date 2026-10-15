import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import type { Prompt } from '../types';
import { useUI } from '../lib/ui';
import { cx } from '../lib/utils';
import { RichContent } from './PromptCard';

/**
 * Hover "peek": after a short hover-intent delay, the full prompt floats next to the card.
 * It never takes pointer events, so it can't get in the way of the list.
 */
interface PeekState {
  prompt: Prompt | null;
  rect: DOMRect | null;
}
const usePeek = create<PeekState>(() => ({ prompt: null, rect: null }));
let timer: number | undefined;

const HOVER_INTENT_MS = 650;

export function schedulePeek(prompt: Prompt, el: HTMLElement) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const ui = useUI.getState();
    if (ui.draggingId || ui.expanded[prompt.id] || !el.isConnected || !el.matches(':hover')) return;
    usePeek.setState({ prompt, rect: el.getBoundingClientRect() });
  }, HOVER_INTENT_MS);
}

export function hidePeek() {
  window.clearTimeout(timer);
  if (usePeek.getState().prompt) usePeek.setState({ prompt: null, rect: null });
}

export function Peek() {
  const { prompt, rect } = usePeek();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let style: React.CSSProperties = {};
  let below = true;
  if (rect) {
    const width = Math.min(Math.max(rect.width, 280), vw - 16);
    const left = Math.min(Math.max(8, rect.left), vw - width - 8);
    const spaceBelow = vh - rect.bottom - 44; // leave room for the footer
    below = spaceBelow >= 150 || spaceBelow > rect.top;
    style = below
      ? { left, width, top: rect.bottom + 6, maxHeight: Math.max(120, Math.min(260, spaceBelow)) }
      : { left, width, bottom: vh - rect.top + 6, maxHeight: Math.max(120, Math.min(260, rect.top - 60)) };
  }

  return (
    <AnimatePresence>
      {prompt && rect && (
        <motion.div
          key={prompt.id}
          initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          style={style}
          aria-hidden
          className="pointer-events-none fixed z-30 overflow-hidden rounded-xl border border-line-strong bg-s2/95 shadow-pop backdrop-blur-md"
        >
          <div
            className={cx(
              'px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg',
              prompt.monospace && 'font-mono text-[12px]',
            )}
          >
            <RichContent text={prompt.content} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--surface-2)] to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
