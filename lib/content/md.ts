/**
 * Template tag for authoring prose inline: strips the common indentation and
 * surrounding blank lines so content can be indented with the code around it.
 */
export function md(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? String(values[i]) : ""),
    "",
  );
  const lines = text.split("\n");
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.length - line.trimStart().length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(indent))
    .join("\n")
    .trim();
}
