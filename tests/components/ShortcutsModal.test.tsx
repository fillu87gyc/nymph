import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ShortcutsModal } from '../../src/client/components/ShortcutsModal.tsx';
import { SHORTCUT_SECTIONS } from '../../src/client/lib/shortcuts.ts';

describe('ShortcutsModal', () => {
  test('定義したすべての節と項目を出す', () => {
    render(<ShortcutsModal onClose={vi.fn()} />);

    for (const section of SHORTCUT_SECTIONS) {
      expect(screen.getByText(section.title)).toBeInTheDocument();
      for (const entry of section.entries) {
        expect(screen.getByText(entry.desc)).toBeInTheDocument();
      }
    }
  });

  test('キーは kbd で出す', () => {
    render(<ShortcutsModal onClose={vi.fn()} />);
    const caps = [...document.querySelectorAll('#shortcuts-modal kbd')].map(
      (el) => el.textContent,
    );
    expect(caps).toContain('?');
    expect(caps).toContain('Ctrl / Cmd');
    expect(caps).toContain('C');
    expect(caps).toContain('T');
  });

  test('✕ で onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    render(<ShortcutsModal onClose={onClose} />);

    await userEvent.click(screen.getByTestId('shortcuts-close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('Escape で onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('背景クリックで閉じ、中身のクリックでは閉じない', async () => {
    const onClose = vi.fn();
    render(<ShortcutsModal onClose={onClose} />);

    const box = screen.getByRole('dialog');
    await userEvent.click(box);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('shortcuts-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
