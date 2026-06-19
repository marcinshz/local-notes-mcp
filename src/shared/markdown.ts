export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSectionAfterHeading(
  content: string,
  headingPattern: RegExp,
): string {
  const headingMatch = content.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    return "";
  }

  const afterHeading = content.slice(
    headingMatch.index + headingMatch[0].length,
  );
  const nextSection = afterHeading.search(/^## /m);
  return (
    nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection)
  ).trim();
}

export function extractMarkdownSection(
  content: string,
  sectionName: string,
): string {
  return extractSectionAfterHeading(
    content,
    new RegExp(`^## ${escapeRegExp(sectionName)}\\s*$`, "im"),
  );
}
