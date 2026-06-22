export interface ContentFontOption {
  id: string;
  label: string;
  bodyFont: string;
  headingFont: string;
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
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    bodyFont: '"Source Serif 4", serif',
    headingFont: '"Source Serif 4", serif',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    bodyFont: '"Merriweather", serif',
    headingFont: '"Merriweather", serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    bodyFont: '"Inter", sans-serif',
    headingFont: '"Inter", sans-serif',
  },
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    bodyFont: '"Atkinson Hyperlegible", sans-serif',
    headingFont: '"Atkinson Hyperlegible", sans-serif',
  },
];

export const DEFAULT_CONTENT_FONT_ID = CONTENT_FONT_OPTIONS[0].id;

export function getContentFontOption(id: string): ContentFontOption {
  return (
    CONTENT_FONT_OPTIONS.find((opt) => opt.id === id) ?? CONTENT_FONT_OPTIONS[0]
  );
}
