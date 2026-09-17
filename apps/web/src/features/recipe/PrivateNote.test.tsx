// §8 — the personal note, and the three ways a debounced save can lie.
//
// The isolation of the note (nobody else can read it) is proven where it is
// enforced, against real Postgres: `supabase/tests/private-notes.sql`. What is
// tested here is the behaviour of the box itself.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOTE_DEBOUNCE_MS, PrivateNote } from './PrivateNote.js';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe('§8 the personal note', () => {
  it('says whose it is, where the typing happens (§12)', () => {
    render(
      <PrivateNote recipeId="r1" initial="" canWrite onSave={vi.fn(async () => undefined)} />,
    );
    expect(screen.getByText(/שמורה לחשבון שלכם בלבד/)).toBeInTheDocument();
    expect(screen.getByText(/אינה נוסעת איתו בשיתוף/)).toBeInTheDocument();
  });

  it('shows the note the account already has', () => {
    render(
      <PrivateNote
        recipeId="r1"
        initial="החמאה של תנובה עובדת טוב יותר"
        canWrite
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByLabelText('ההערה האישית שלי')).toHaveValue(
      'החמאה של תנובה עובדת טוב יותר',
    );
  });

  it('waits for the pause §8 asks for, then writes ONCE', async () => {
    const u = user();
    const onSave = vi.fn(async () => undefined);
    render(<PrivateNote recipeId="r1" initial="" canWrite onSave={onSave} />);

    await u.type(screen.getByLabelText('ההערה האישית שלי'), 'הערה');
    // Four keystrokes, no write yet — the whole point of the debounce.
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('מקליד…');

    vi.advanceTimersByTime(NOTE_DEBOUNCE_MS);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('הערה');
  });

  it('does not say "נשמר" until the write has actually returned', async () => {
    const u = user();
    let release: (() => void) | null = null;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<PrivateNote recipeId="r1" initial="" canWrite onSave={onSave} />);

    await u.type(screen.getByLabelText('ההערה האישית שלי'), 'א');
    vi.advanceTimersByTime(NOTE_DEBOUNCE_MS);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('שומר…'));
    expect(screen.getByRole('status')).not.toHaveTextContent('נשמר');

    release!();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('נשמר'));
  });

  it('reports a failed save instead of a false confirmation, and keeps the text', async () => {
    const u = user();
    const onSave = vi.fn(async () => {
      throw new Error('שמירת ההערה האישית נכשלה: אין חיבור');
    });
    render(<PrivateNote recipeId="r1" initial="" canWrite onSave={onSave} />);

    await u.type(screen.getByLabelText('ההערה האישית שלי'), 'טקסט חשוב');
    vi.advanceTimersByTime(NOTE_DEBOUNCE_MS);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/נכשלה/),
    );
    expect(screen.getByRole('status')).not.toHaveTextContent('נשמר');
    // Nothing the user typed is thrown away by the failure.
    expect(screen.getByLabelText('ההערה האישית שלי')).toHaveValue('טקסט חשוב');
  });

  it('flushes the pending text when the screen is left mid-timer', async () => {
    const u = user();
    const onSave = vi.fn(async () => undefined);
    const view = render(
      <PrivateNote recipeId="r1" initial="" canWrite onSave={onSave} />,
    );

    await u.type(screen.getByLabelText('ההערה האישית שלי'), 'כמעט נשמר');
    expect(onSave).not.toHaveBeenCalled();
    // Type, then press back. The timer never fires; the note must survive.
    view.unmount();
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('כמעט נשמר'));
  });

  it('writes an emptied note too, because clearing it is an action', async () => {
    const u = user();
    const onSave = vi.fn(async () => undefined);
    render(<PrivateNote recipeId="r1" initial="יש כאן משהו" canWrite onSave={onSave} />);

    await u.clear(screen.getByLabelText('ההערה האישית שלי'));
    vi.advanceTimersByTime(NOTE_DEBOUNCE_MS);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
  });

  it('does not overwrite live typing with a note that arrives late', async () => {
    const u = user();
    const onSave = vi.fn(async () => undefined);
    const view = render(
      <PrivateNote recipeId="r1" initial={null} canWrite onSave={onSave} />,
    );

    await u.type(screen.getByLabelText('ההערה האישית שלי'), 'מה שהקלדתי');
    // The read resolves only now, after the user has already typed.
    view.rerender(
      <PrivateNote recipeId="r1" initial="טקסט מהשרת" canWrite onSave={onSave} />,
    );
    expect(screen.getByLabelText('ההערה האישית שלי')).toHaveValue('מה שהקלדתי');
  });

  it('offers no box at all when there is no account to save it to', () => {
    render(
      <PrivateNote
        recipeId="r1"
        initial=""
        canWrite={false}
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.queryByLabelText('ההערה האישית שלי')).not.toBeInTheDocument();
    expect(screen.getByText(/אין חיבור לשרת/)).toBeInTheDocument();
  });
});
