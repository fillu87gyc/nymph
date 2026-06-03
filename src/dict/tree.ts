import { marked, type Token, type Tokens } from 'marked';

export interface NestedNode {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'p'
    | 'li'
    | 'code'
    | 'blockquote'
    | 'table';
  text: string;
  raw: string;
  html: string;
  depth?: number;
  children: NestedNode[];
  parent?: NestedNode;
  line?: number;
}

type HeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

function headingType(depth: HeadingDepth): NestedNode['type'] {
  return `h${depth}` as NestedNode['type'];
}

function tokenToNode(token: Token): NestedNode | null {
  const renderer = new marked.Renderer();
  const renderSingle = (tok: Token): string => {
    try {
      return marked.parser([tok] as Token[], { renderer });
    } catch {
      return '';
    }
  };

  if (token.type === 'heading') {
    const depth = token.depth as HeadingDepth;
    // Extract plain text from heading tokens
    const text =
      'text' in token
        ? String(token.text)
        : token.raw.replace(/^#+\s*/, '').trim();
    return {
      type: headingType(depth),
      text,
      raw: token.raw,
      html: renderSingle(token),
      depth,
      children: [],
    };
  }

  if (token.type === 'paragraph') {
    const text = 'text' in token ? String(token.text) : token.raw.trim();
    return {
      type: 'p',
      text,
      raw: token.raw,
      html: renderSingle(token),
      children: [],
    };
  }

  if (token.type === 'list') {
    const items: NestedNode[] = [];
    for (const item of token.items) {
      items.push({
        type: 'li',
        text: item.text,
        raw: item.raw,
        html: `<li>${item.text}</li>`,
        children: [],
      });
    }
    return items.length > 0 ? items[0] : null;
  }

  if (token.type === 'code') {
    const text = 'text' in token ? String(token.text) : token.raw;
    return {
      type: 'code',
      text,
      raw: token.raw,
      html: renderSingle(token),
      children: [],
    };
  }

  if (token.type === 'blockquote') {
    const text = 'text' in token ? String(token.text) : token.raw.trim();
    return {
      type: 'blockquote',
      text,
      raw: token.raw,
      html: renderSingle(token),
      children: [],
    };
  }

  if (token.type === 'table') {
    return {
      type: 'table',
      text: token.raw.trim(),
      raw: token.raw,
      html: renderSingle(token),
      children: [],
    };
  }

  return null;
}

function tokenToNodes(token: Token): NestedNode[] {
  const renderer = new marked.Renderer();
  const renderSingle = (tok: Token): string => {
    try {
      return marked.parser([tok] as Token[], { renderer });
    } catch {
      return '';
    }
  };

  if (token.type === 'list') {
    const items: NestedNode[] = [];
    for (const item of token.items) {
      items.push({
        type: 'li',
        text: item.text,
        raw: item.raw,
        html: `<li>${item.text}</li>`,
        children: [],
      });
    }
    return items;
  }

  const single = tokenToNode(token);
  if (single) return [single];
  return [];
}

export function buildTree(markdown: string): NestedNode[] {
  const tokens = marked.lexer(markdown);
  const roots: NestedNode[] = [];

  // Stack of heading nodes: stack[i] is the current open node at depth i+1
  // stack[0] = current h1, stack[1] = current h2, etc.
  const headingStack: Array<NestedNode | null> = [
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  function addToParent(node: NestedNode): void {
    // Find the deepest heading that could be a parent
    let parentNode: NestedNode | null = null;
    for (let d = 5; d >= 0; d--) {
      if (headingStack[d] !== null) {
        parentNode = headingStack[d];
        break;
      }
    }

    if (parentNode) {
      node.parent = parentNode;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function insertHeading(node: NestedNode): void {
    const depth = (node.depth as number) - 1; // 0-indexed

    // Close all headings at same or deeper level
    for (let d = depth; d <= 5; d++) {
      headingStack[d] = null;
    }

    // Find parent: look for the nearest open heading at shallower depth
    let parentNode: NestedNode | null = null;
    for (let d = depth - 1; d >= 0; d--) {
      if (headingStack[d] !== null) {
        parentNode = headingStack[d];
        break;
      }
    }

    if (parentNode) {
      node.parent = parentNode;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }

    headingStack[depth] = node;
  }

  for (const token of tokens) {
    if (token.type === 'heading') {
      const node = tokenToNode(token);
      if (node) {
        insertHeading(node);
      }
    } else {
      const nodes = tokenToNodes(token);
      for (const node of nodes) {
        addToParent(node);
      }
    }
  }

  return roots;
}
