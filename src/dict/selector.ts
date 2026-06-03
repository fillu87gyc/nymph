import type { NestedNode } from './tree.ts';

type NodeType = NestedNode['type'];

interface SimpleSelector {
  type: NodeType | '*';
  contains?: string;
}

// Parse a simple selector like "h2", "h3:contains('text')", "*"
function parseSimple(raw: string): SimpleSelector {
  const containsMatch = raw.match(/:contains\(['"](.+?)['"]\)/);
  const contains = containsMatch ? containsMatch[1] : undefined;
  const typePart = raw.replace(/:contains\(['"].*?['"]\)/g, '').trim();

  const validTypes: Array<NodeType | '*'> = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'code', 'blockquote', 'table', '*',
  ];
  const type = validTypes.includes(typePart as NodeType | '*')
    ? (typePart as NodeType | '*')
    : '*';

  return { type, contains };
}

function matchesSimple(node: NestedNode, sel: SimpleSelector): boolean {
  if (sel.type !== '*' && node.type !== sel.type) return false;
  if (sel.contains && !node.text.includes(sel.contains)) return false;
  return true;
}

// Collect all nodes in the subtree (depth-first)
function collectAll(nodes: NestedNode[]): NestedNode[] {
  const result: NestedNode[] = [];
  function walk(n: NestedNode) {
    result.push(n);
    for (const c of n.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return result;
}

// Returns all descendants of a node
function descendants(node: NestedNode): NestedNode[] {
  return collectAll(node.children);
}

// Returns direct children of a node
function directChildren(node: NestedNode): NestedNode[] {
  return node.children;
}

// Returns siblings after a node. rootNodes is used when node has no parent (root-level).
function siblingsAfter(node: NestedNode, rootNodes: NestedNode[]): NestedNode[] {
  const siblings = node.parent ? node.parent.children : rootNodes;
  const idx = siblings.indexOf(node);
  if (idx === -1) return [];
  return siblings.slice(idx + 1);
}

// Returns immediately adjacent sibling after a node. rootNodes for root-level nodes.
function adjacentSibling(node: NestedNode, rootNodes: NestedNode[]): NestedNode | null {
  const siblings = node.parent ? node.parent.children : rootNodes;
  const idx = siblings.indexOf(node);
  if (idx === -1 || idx + 1 >= siblings.length) return null;
  return siblings[idx + 1];
}

// Tokenize selector into parts separated by combinators: >, +, ~, or space
type Combinator = '>' | '+' | '~' | ' ';
interface SelectorPart {
  combinator: Combinator | null; // null for first part
  selector: SimpleSelector;
}

function parseSelectorParts(selector: string): SelectorPart[] {
  // Split on combinators while keeping them
  // Pattern: split on >, +, ~ (with optional spaces) or spaces (space-separated descendants)
  const parts: SelectorPart[] = [];

  // Tokenize: handle > + ~ as explicit combinators, whitespace as descendant combinator
  // We'll use a simple state machine
  const tokens: Array<{ type: 'combinator'; value: Combinator } | { type: 'selector'; value: string }> = [];

  let current = '';
  let i = 0;
  const s = selector.trim();

  while (i < s.length) {
    const ch = s[i];

    // Skip over :contains('...') or :contains("...") without splitting on interior chars
    if (ch === ':' && s.slice(i).startsWith(':contains(')) {
      const quoteChar = s[i + ':contains('.length];
      const closeIdx = s.indexOf(quoteChar + ')', i + ':contains('.length + 1);
      if (closeIdx !== -1) {
        current += s.slice(i, closeIdx + 2);
        i = closeIdx + 2;
        continue;
      }
    }

    if (ch === '>' || ch === '+' || ch === '~') {
      const trimmed = current.trim();
      if (trimmed) tokens.push({ type: 'selector', value: trimmed });
      current = '';
      tokens.push({ type: 'combinator', value: ch as Combinator });
      i++;
      // Skip surrounding spaces
      while (i < s.length && s[i] === ' ') i++;
    } else if (ch === ' ') {
      const trimmed = current.trim();
      if (trimmed) {
        // Check if next non-space char is a combinator
        let j = i + 1;
        while (j < s.length && s[j] === ' ') j++;
        if (j < s.length && (s[j] === '>' || s[j] === '+' || s[j] === '~')) {
          // Space before explicit combinator — just skip
          current += ch;
          i++;
        } else {
          // Space is the descendant combinator
          tokens.push({ type: 'selector', value: trimmed });
          current = '';
          tokens.push({ type: 'combinator', value: ' ' });
          i++;
          while (i < s.length && s[i] === ' ') i++;
        }
      } else {
        i++;
      }
    } else {
      current += ch;
      i++;
    }
  }

  const trimmed = current.trim();
  if (trimmed) tokens.push({ type: 'selector', value: trimmed });

  // Build SelectorPart list
  let lastCombinator: Combinator | null = null;
  for (const tok of tokens) {
    if (tok.type === 'combinator') {
      lastCombinator = tok.value;
    } else {
      parts.push({
        combinator: lastCombinator,
        selector: parseSimple(tok.value),
      });
      lastCombinator = null;
    }
  }

  return parts;
}

// Apply a two-part selector (left combinator right) to a set of candidate nodes
// Returns nodes matching `right` relative to any node in `candidates` matching `left`
// rootNodes is needed for ~ and + on root-level nodes that have no parent.
function applyStep(
  candidates: NestedNode[],
  combinator: Combinator,
  right: SimpleSelector,
  rootNodes: NestedNode[],
): NestedNode[] {
  const results: NestedNode[] = [];
  const seen = new Set<NestedNode>();

  for (const node of candidates) {
    let targets: NestedNode[] = [];

    if (combinator === '>') {
      targets = directChildren(node);
    } else if (combinator === ' ') {
      targets = descendants(node);
    } else if (combinator === '~') {
      targets = siblingsAfter(node, rootNodes);
    } else if (combinator === '+') {
      const adj = adjacentSibling(node, rootNodes);
      targets = adj ? [adj] : [];
    }

    for (const t of targets) {
      if (matchesSimple(t, right) && !seen.has(t)) {
        seen.add(t);
        results.push(t);
      }
    }
  }

  return results;
}

/**
 * Select nodes from a tree using a CSS-like selector.
 * Supports: h1-h6, p, li, code, blockquote, table, *, :contains('text'), >, +, ~, space
 */
export function select(nodes: NestedNode[], selector: string): NestedNode[] {
  const parts = parseSelectorParts(selector);
  if (parts.length === 0) return [];

  // Start: find all nodes matching the first selector part
  const all = collectAll(nodes);
  let candidates = all.filter((n) => matchesSimple(n, parts[0].selector));

  // Apply subsequent parts; pass root nodes for ~ / + on root-level elements
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part.combinator) break;
    candidates = applyStep(candidates, part.combinator, part.selector, nodes);
  }

  return candidates;
}

/**
 * Resolve a definition selector relative to a matched term node.
 * The literal string "term" in the selector is replaced by the term node.
 *
 * E.g. "term > p" means: direct children p of termNode
 *      "term ~ *" means: siblings after termNode
 */
export function selectRelative(
  termNode: NestedNode,
  relSelector: string,
  rootNodes: NestedNode[],
): NestedNode[] {
  // Replace "term" token with the termNode anchor and evaluate
  const trimmed = relSelector.trim();

  // Check if the selector starts with "term"
  if (!trimmed.startsWith('term')) {
    // Fall back to normal select with empty roots (not useful but safe)
    return [];
  }

  const rest = trimmed.slice('term'.length).trim();

  if (!rest) {
    // Just "term" — return the term node itself
    return [termNode];
  }

  // Parse the combinator and right selector
  let combinator: Combinator;
  let rightStr: string;

  if (rest.startsWith('>')) {
    combinator = '>';
    rightStr = rest.slice(1).trim();
  } else if (rest.startsWith('+')) {
    combinator = '+';
    rightStr = rest.slice(1).trim();
  } else if (rest.startsWith('~')) {
    combinator = '~';
    rightStr = rest.slice(1).trim();
  } else if (rest.startsWith(' ')) {
    combinator = ' ';
    rightStr = rest.trim();
  } else {
    combinator = ' ';
    rightStr = rest;
  }

  const rightSel = parseSimple(rightStr);
  // Pass rootNodes so ~ and + work correctly on root-level term nodes
  return applyStep([termNode], combinator, rightSel, rootNodes);
}
