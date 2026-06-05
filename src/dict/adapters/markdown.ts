import { registerAdapter } from '../adapter.ts';
import type { DictEntry, SourceRules } from '../schema.ts';
import { extractAliasesFromText, select, selectRelative } from '../selector.ts';
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

    // Aliases are extracted only when rules.aliases is specified.
    // "term" → parenthetical notation in the term node itself.
    // Any other selector → plain text of the matched nodes.
    const aliases: string[] = [];
    if (rules.aliases) {
      const aliasNodes = selectRelative(termNode, rules.aliases, tree);
      for (const aliasNode of aliasNodes) {
        if (aliasNode === termNode) {
          for (const a of extractAliasesFromText(termNode.text)) {
            if (!aliases.includes(a)) aliases.push(a);
          }
        } else {
          const text = nodeToPlainText(aliasNode);
          if (text && !aliases.includes(text)) aliases.push(text);
        }
      }
    }

    const termText = termNode.text
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/ [-–—] *.+$/, '')
      .replace(/[：:] *.+$/, '')
      .trim();

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
