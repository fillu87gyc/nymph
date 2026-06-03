import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DictTooltip } from '../../../src/client/components/DictTooltip.tsx';

const mockEntry = {
  term: '集約',
  aliases: [],
  definition: '集約とは...',
  definitionHtml: '<p>集約とは...</p>',
  source: 'glossary',
  sourceRef: '',
};

const mockRect = {
  top: 100,
  left: 200,
  bottom: 120,
  right: 300,
  width: 100,
  height: 20,
} as DOMRect;

test('entry が null のとき tooltip は非表示', () => {
  render(<DictTooltip entry={null} anchorRect={null} />);
  const tooltip = screen.getByTestId('dict-tooltip');
  expect(tooltip).toHaveStyle({ display: 'none' });
});

test('entry があるとき term と definition が表示される', () => {
  render(<DictTooltip entry={mockEntry} anchorRect={mockRect} />);
  const tooltip = screen.getByTestId('dict-tooltip');
  expect(tooltip).toHaveStyle({ display: 'block' });
  expect(tooltip).toHaveTextContent('集約');
  expect(tooltip).toHaveTextContent('集約とは');
});

test('entry があるが anchorRect が null のとき非表示', () => {
  render(<DictTooltip entry={mockEntry} anchorRect={null} />);
  const tooltip = screen.getByTestId('dict-tooltip');
  expect(tooltip).toHaveStyle({ display: 'none' });
});

test('definitionHtml がないとき definition テキストが表示される', () => {
  const entryNoHtml = { ...mockEntry, definitionHtml: '' };
  render(<DictTooltip entry={entryNoHtml} anchorRect={mockRect} />);
  expect(screen.getByTestId('dict-tooltip')).toHaveTextContent('集約とは...');
});
