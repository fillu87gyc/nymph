import { registerAdapter } from '../adapter.ts';
import type { DictEntry, SourceRules } from '../schema.ts';
import { select, selectRelative } from '../selector.ts';
import type { NestedNode } from '../tree.ts';
import { buildTree } from '../tree.ts';

function nodeToPlainText(node: NestedNode): string {
  // Strip HTML tags from the html field to get plain text
  return node.html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function nodesToHtml(nodes: NestedNode[]): string {
  return nodes.map((n) => n.html).join('\n');
}

function nodesToText(nodes: NestedNode[]): string {
  return nodes
    .map((n) => nodeToPlainText(n))
    .filter(Boolean)
    .join('\n');
}

export function extractEntries(raw: string, rules: SourceRules): DictEntry[] {
  const tree = buildTree(raw);

  const termNodes = select(tree, rules.term);
  const entries: DictEntry[] = [];

  for (const termNode of termNodes) {
    // Pass tree roots so ~ and + work for root-level term nodes (spec case B)
    const defNodes = selectRelative(termNode, rules.definition, tree);

    const definition = nodesToText(defNodes);
    const definitionHtml = nodesToHtml(defNodes);

    // Extract aliases: if term text contains parenthetical English e.g. "集約（Aggregate）"
    const aliases: string[] = [];
    const aliasMatch = termNode.text.match(/[（(]([A-Za-z][^）)]*)[）)]/);
    if (aliasMatch) aliases.push(aliasMatch[1].trim());

    const termText = termNode.text.replace(/[（(][^）)]*[）)]/g, '').trim();

    entries.push({
      term: termText,
      aliases,
      definition,
      definitionHtml,
      source: '', // filled by caller
      sourceRef: '', // filled by caller
    });
  }

  return entries;
}

registerAdapter({
  name: 'markdown',
  extract: extractEntries,
});
