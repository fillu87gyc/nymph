import type { CodeContext, Comment, TableContext } from '../types.ts';

export function ctxDisplay(c: Comment): string {
  const ctx = c.context;
  if (!ctx) return '';
  if (typeof ctx === 'string') return ctx.split('\n')[0];
  if ('headers' in ctx) return (ctx as TableContext).headers.join(' | ');
  if ('code' in ctx) return (ctx as CodeContext).code.split('\n')[0];
  return '';
}
