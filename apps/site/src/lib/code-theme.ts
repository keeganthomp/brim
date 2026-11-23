/**
 * Quiet code colors that match the marketing sample: ink for code, muted strings, faint syntax.
 * Plain TextMate themes, so Shiki needs no extra dependency.
 */
function codeTheme(type: 'light' | 'dark') {
  const light = type === 'light';
  const ink = light ? '#171717' : '#fafafa';
  const body = light ? '#3f3f3f' : '#d4d4d4';
  const muted = light ? '#737373' : '#a3a3a3';
  const faint = light ? '#9a9a9a' : '#737373';
  return {
    name: `brim-${type}`,
    type,
    colors: {
      'editor.background': light ? '#f7f7f7' : '#202020',
      'editor.foreground': body,
    },
    tokenColors: [
      { settings: { foreground: body } },
      { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: faint } },
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: faint, fontStyle: 'italic' },
      },
      {
        scope: [
          'keyword',
          'storage',
          'keyword.operator.new',
          'keyword.operator.expression',
          'keyword.control',
        ],
        settings: { foreground: ink },
      },
      {
        scope: ['entity.name.function', 'support.function', 'entity.name.command'],
        settings: { foreground: ink },
      },
      {
        scope: ['string', 'punctuation.definition.string', 'string.unquoted'],
        settings: { foreground: muted },
      },
      {
        scope: ['constant', 'support.constant', 'variable.other.constant'],
        settings: { foreground: body },
      },
      {
        scope: ['support.type.property-name', 'meta.object-literal.key', 'variable.other.env'],
        settings: { foreground: body },
      },
    ],
  };
}

/** Shiki theme for docs code in light mode. */
export const brimLightCode = codeTheme('light');
/** Shiki theme for docs code in dark mode. */
export const brimDarkCode = codeTheme('dark');
