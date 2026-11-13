// Accept Markdown's $...$ syntax and common LaTeX \( ... \) / \[ ... \] delimiters.
// The conversion affects preview rendering only; the original Markdown remains unchanged.
export function normalizeMarkdownMath(source: string): string {
  const normalized = source
    .replace(/\\{1,2}\(/g, () => '$')
    .replace(/\\{1,2}\)/g, () => '$')
    .replace(/\\{1,2}\[/g, () => '$$')
    .replace(/\\{1,2}\]/g, () => '$$');
  return normalized.replace(/(\${1,2})([\s\S]*?)\1/g, (_match, delimiter: string, expression: string) =>
    delimiter + expression.replace(/\\_/g, '_') + delimiter,
  );
}
