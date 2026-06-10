import type {
  CodeContext,
  Comment,
  DiffContext,
  TableContext,
} from '../types.ts';

export function isDiffContext(ctx: Comment['context']): ctx is DiffContext {
  return typeof ctx === 'object' && ctx !== null && 'hunk' in ctx;
}

export function ctxDisplay(c: Comment): string {
  const ctx = c.context;
  if (!ctx) return '';
  if (typeof ctx === 'string') return ctx.split('\n')[0];
  if (isDiffContext(ctx)) return ctx.line;
  if ('headers' in ctx) return (ctx as TableContext).headers.join(' | ');
  if ('code' in ctx) return (ctx as CodeContext).code.split('\n')[0];
  return '';
}
