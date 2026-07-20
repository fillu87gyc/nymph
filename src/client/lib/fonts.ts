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
    id: 'inter',
    label: 'デフォルト（Inter）',
    bodyFont: '"Inter", sans-serif',
    headingFont: '"Inter", sans-serif',
    // index.html で先読み済み
  },
  {
    id: 'default',
    label: 'Lora / Playfair Display',
    bodyFont: '"Lora", serif',
    headingFont: '"Playfair Display", serif',
    googleFontsParam:
      'family=Lora:ital,wght@0,400;0,500;1,400&family=Playfair+Display:wght@700',
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
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    bodyFont: '"Atkinson Hyperlegible", sans-serif',
    headingFont: '"Atkinson Hyperlegible", sans-serif',
    googleFontsParam:
      'family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'zen-kaku-gothic-new',
    label: 'Zen Kaku Gothic New',
    bodyFont: '"Zen Kaku Gothic New", sans-serif',
    headingFont: '"Zen Kaku Gothic New", sans-serif',
    googleFontsParam: 'family=Zen+Kaku+Gothic+New:wght@300;400;500;700;900',
  },
  {
    id: 'zen-old-mincho',
    label: 'Zen Old Mincho',
    bodyFont: '"Zen Old Mincho", serif',
    headingFont: '"Zen Old Mincho", serif',
    googleFontsParam: 'family=Zen+Old+Mincho:wght@400;500;600;700;900',
  },
  {
    id: 'zen-antique',
    label: 'Zen Antique',
    bodyFont: '"Zen Antique", serif',
    headingFont: '"Zen Antique", serif',
    googleFontsParam: 'family=Zen+Antique',
  },
  {
    id: 'shippori-mincho',
    label: 'Shippori Mincho',
    bodyFont: '"Shippori Mincho", serif',
    headingFont: '"Shippori Mincho", serif',
    googleFontsParam: 'family=Shippori+Mincho:wght@400;500;600;700;800',
  },
  {
    id: 'biz-udpgothic',
    label: 'BIZ UDPGothic',
    bodyFont: '"BIZ UDPGothic", sans-serif',
    headingFont: '"BIZ UDPGothic", sans-serif',
    googleFontsParam: 'family=BIZ+UDPGothic:ital,wght@0,400;0,700;1,400;1,700',
  },
  {
    id: 'biz-udmincho',
    label: 'BIZ UDMincho',
    bodyFont: '"BIZ UDMincho", serif',
    headingFont: '"BIZ UDMincho", serif',
    googleFontsParam: 'family=BIZ+UDMincho:wght@400;700',
  },
  {
    id: 'kaisei-decol',
    label: 'Kaisei Decol',
    bodyFont: '"Kaisei Decol", serif',
    headingFont: '"Kaisei Decol", serif',
    googleFontsParam: 'family=Kaisei+Decol:wght@400;500;700',
  },
  {
    id: 'kaisei-opti',
    label: 'Kaisei Opti',
    bodyFont: '"Kaisei Opti", serif',
    headingFont: '"Kaisei Opti", serif',
    googleFontsParam: 'family=Kaisei+Opti:wght@400;500;700',
  },
  {
    id: 'crimson-pro',
    label: 'Crimson Pro',
    bodyFont: '"Crimson Pro", serif',
    headingFont: '"Crimson Pro", serif',
    googleFontsParam:
      'family=Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'spectral',
    label: 'Spectral',
    bodyFont: '"Spectral", serif',
    headingFont: '"Spectral", serif',
    googleFontsParam: 'family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'newsreader',
    label: 'Newsreader',
    bodyFont: '"Newsreader", serif',
    headingFont: '"Newsreader", serif',
    googleFontsParam:
      'family=Newsreader:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    bodyFont: '"Work Sans", sans-serif',
    headingFont: '"Work Sans", sans-serif',
    googleFontsParam: 'family=Work+Sans:wght@400;500;600;700',
  },
  {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    bodyFont: '"IBM Plex Sans", sans-serif',
    headingFont: '"IBM Plex Sans", sans-serif',
    googleFontsParam: 'family=IBM+Plex+Sans:wght@400;500;600;700',
  },
  {
    id: 'literata',
    label: 'Literata',
    bodyFont: '"Literata", serif',
    headingFont: '"Literata", serif',
    googleFontsParam: 'family=Literata:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
];

export const DEFAULT_CONTENT_FONT_ID = CONTENT_FONT_OPTIONS[0].id;

export function getContentFontOption(id: string): ContentFontOption {
  return (
    CONTENT_FONT_OPTIONS.find((opt) => opt.id === id) ?? CONTENT_FONT_OPTIONS[0]
  );
}
