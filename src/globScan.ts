import { Glob } from 'bun';
import type { GlobScan } from './resolveInputs.ts';

/**
 * Bun の Glob による glob 展開。
 *
 * Bun 依存をこのモジュールに閉じ込めることで、`resolveInputs` 自体は
 * vitest(node) 上でも検証できる（実 glob の挙動は E2E で担保する）。
 */
export const globScan: GlobScan = (pattern, cwd) => new Glob(pattern).scan(cwd);
