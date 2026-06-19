import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractMarkdownSection,
  extractSectionAfterHeading,
} from "./markdown.js";

const sample = `# Title

## Specific topics
- Variables
- Loops

## Success criteria
Can write a loop

## Deliverables
One script
`;

describe("extractSectionAfterHeading", () => {
  it("returns content until the next heading", () => {
    const block = extractSectionAfterHeading(sample, /^## Specific topics\s*$/im);
    assert.match(block, /- Variables/);
    assert.doesNotMatch(block, /Success criteria/);
  });

  it("returns empty string when heading is missing", () => {
    assert.equal(
      extractSectionAfterHeading(sample, /^## Missing\s*$/im),
      "",
    );
  });
});

describe("extractMarkdownSection", () => {
  it("extracts a named section", () => {
    const body = extractMarkdownSection(sample, "Success criteria");
    assert.equal(body, "Can write a loop");
  });
});
