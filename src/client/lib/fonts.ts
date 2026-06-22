export interface ContentFontOption {
  id: string;
  label: string;
  bodyFont: string;
  headingFont: string;
  /** Google Fonts CSS2 family= クエリ片。デフォルト（index.html で先読み済み）は undefined */
  googleFontsParam?: string;
}

export const CONTENT_FONT_OPTIONS: ContentFontOption[] = [
  {
    id: 'default',
    label: 'デフォルト（Lora / Playfair Display）',
    bodyFont: '"Lora", serif',
    headingFont: '"Playfair Display", serif',
  },
  {
    id: 'noto-serif-jp',
    label: 'Noto Serif JP',
    bodyFont: '"Noto Serif JP", serif',
    headingFont: '"Noto Serif JP", serif',
    googleFontsParam: 'family=Noto+Serif+JP:wght@400;500;700',
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    bodyFont: '"Source Serif 4", serif',
    headingFont: '"Source Serif 4", serif',
    googleFontsParam: 'family=Source+Serif+4:wght@400;500;600;700',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    bodyFont: '"Merriweather", serif',
    headingFont: '"Merriweather", serif',
    googleFontsParam: 'family=Merriweather:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'inter',
    label: 'Inter',
    bodyFont: '"Inter", sans-serif',
    headingFont: '"Inter", sans-serif',
    googleFontsParam: 'family=Inter:wght@400;500;600;700',
  },
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    bodyFont: '"Atkinson Hyperlegible", sans-serif',
    headingFont: '"Atkinson Hyperlegible", sans-serif',
    googleFontsParam:
      'family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400',
  },
];

export const DEFAULT_CONTENT_FONT_ID = CONTENT_FONT_OPTIONS[0].id;

export function getContentFontOption(id: string): ContentFontOption {
  return (
    CONTENT_FONT_OPTIONS.find((opt) => opt.id === id) ?? CONTENT_FONT_OPTIONS[0]
  );
}
