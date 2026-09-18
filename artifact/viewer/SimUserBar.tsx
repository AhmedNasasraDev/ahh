/*
  ARTIFACT TEST TOOL — NOT PART OF THE PRODUCT'S UI.

  ─────────────────────────────────────────────────────────────────────────────
  WHAT IT IS

  One control: which of the group's own members the viewer is acting as. It
  exists so a conversation can be held in the artifact — write as a student,
  switch, answer as the instructor, switch back — without a second browser and
  without a server.

  WHY IT LOOKS LIKE A TOOL AND NOT LIKE THE APP

  Because it is not in the product. The dashed frame, the grey, and the line
  that says so are deliberate: anything in this page that looks like the
  product IS the product, and this must not be mistaken for a feature. There
  is no user switcher in Recipe Notebook and this does not propose one.

  WHY IT IS ATTACHED TO THE DOM RATHER THAN PLACED IN THE CHAT

  Putting it "at the top of the chat" is where it is useful, and the chat is
  `features/groups/GroupChat.tsx` — a product file, which this task may not
  touch. So the bar finds the chat's own landmark
  (`section[aria-label="צ׳אט הקבוצה"]`), inserts a host element of its own
  BEFORE it, and portals into that. React never owns the host and the product
  component is not modified, not wrapped and not re-implemented.

  A foreign node inside a React-managed parent is a known trade-off: React only
  ever addresses its own nodes, so the insert is safe, and when the chat tab is
  left the observer removes the host rather than leaving it above the lesson
  list.

  WHAT THE SWITCHER MAY OFFER

  Only the people in that group's roster, with the role the roster gives them
  and the product's own label for it (`ROLE_LABEL`). It grants nothing: after a
  switch every screen asks the fixture again, and the fixture applies the same
  rank model the policies do. An instructor sees the הכרזה checkbox because
  `can('instructor', 'announce')` is true, not because this file said so.
*/

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { authorLabel } from '../../apps/web/src/features/groups/chat.js';
import { ROLE_LABEL } from '../../apps/web/src/features/groups/roles.js';
import { simParticipants, VIEWER_USER_ID } from './fixtures.js';

/* ── who the viewer is acting as ─────────────────────────────────────────── */

let activeUserId = VIEWER_USER_ID;
const listeners = new Set<() => void>();

export function setActiveSimUser(userId: string): void {
  if (userId === activeUserId) return;
  activeUserId = userId;
  for (const fn of listeners) fn();
}

export function useActiveSimUser(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => activeUserId,
    () => activeUserId,
  );
}

/* ── the host element, above the product's own chat section ──────────────── */

const CHAT = 'section[aria-label="צ׳אט הקבוצה"]';

function useChatHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const mine = document.createElement('div');
    mine.setAttribute('data-artifact-tool', 'active-sim-user');
    mine.style.flex = 'none';

    const sync = (): void => {
      const chat = document.querySelector(CHAT);
      if (chat === null) {
        if (mine.isConnected) mine.remove();
        setHost(null);
        return;
      }
      if (chat.previousElementSibling !== mine) {
        chat.parentElement?.insertBefore(mine, chat);
      }
      setHost(mine);
    };

    // The chat section appears and disappears with the tab, so this watches
    // rather than looking once.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
      observer.disconnect();
      mine.remove();
    };
  }, []);

  return host;
}

/* ── the bar ─────────────────────────────────────────────────────────────── */

const box: React.CSSProperties = {
  border: '1px dashed #9aa0a6',
  borderRadius: '8px',
  background: '#f4f4f5',
  color: '#3c4043',
  padding: '8px 10px',
  /* No margin: the host sits in GroupScreen's `.page`, which is a grid with a
     14px gap, and a margin on a grid item is added to the row rather than
     collapsed — 10px of it was enough to push the frame past the viewport. */
  margin: '0',
  font: '500 13px/1.4 system-ui, sans-serif',
};

const caption: React.CSSProperties = {
  margin: '0 0 6px',
  font: '600 11px/1.3 system-ui, sans-serif',
  letterSpacing: '0.02em',
  color: '#5f6368',
};

const list: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

const chip = (on: boolean): React.CSSProperties => ({
  border: on ? '1px solid #3c4043' : '1px solid #c4c7c5',
  borderRadius: '999px',
  background: on ? '#3c4043' : '#ffffff',
  color: on ? '#ffffff' : '#3c4043',
  padding: '5px 10px',
  font: '500 12px/1 system-ui, sans-serif',
  cursor: 'pointer',
  minHeight: '28px',
});

const note: React.CSSProperties = {
  margin: '6px 0 0',
  font: '400 10px/1.4 system-ui, sans-serif',
  color: '#5f6368',
};

export function SimUserBar() {
  const location = useLocation();
  const host = useChatHost();
  const active = useActiveSimUser();

  const groupId = useMemo(() => {
    const m = /^\/group\/([^/]+)/.exec(location.pathname);
    return m?.[1] ?? null;
  }, [location.pathname]);

  if (host === null || groupId === null) return null;

  const people = simParticipants(groupId);
  if (people.length === 0) return null;

  return createPortal(
    <div style={box} dir="rtl">
      <p style={caption}>משתמש פעיל בסימולציה — כלי בדיקה של ה־Artifact</p>
      <div style={list} role="group" aria-label="משתמש פעיל בסימולציה">
        {people.map((p) => {
          const on = p.userId === active;
          return (
            <button
              key={p.userId}
              type="button"
              style={chip(on)}
              aria-pressed={on}
              onClick={() => setActiveSimUser(p.userId)}
            >
              {authorLabel(p.displayName)} — {ROLE_LABEL[p.role]}
            </button>
          );
        })}
      </div>
      <p style={note}>
        אינו חלק מ־Recipe Notebook. אין Realtime ואין שרת: המסך מחליף חשבון
        מקומית וקורא מחדש מאותה סימולציה.
      </p>
    </div>,
    host,
  );
}
