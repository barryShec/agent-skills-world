export function dumpFrontMatter(metadata: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    let rendered: string;
    if (Array.isArray(value) || (value && typeof value === "object")) {
      rendered = JSON.stringify(value);
    } else if (value === null || value === undefined) {
      rendered = "null";
    } else {
      rendered = String(value);
    }
    lines.push(`${key}: ${rendered}`);
  }
  lines.push("---");
  return lines.join("\n");
}

export function parseFrontMatter(text: string): { metadata: Record<string, unknown>; body: string } {
  if (!text.startsWith("---\n")) {
    return { metadata: {}, body: text };
  }
  const splitIndex = text.indexOf("\n---\n", 4);
  if (splitIndex === -1) {
    return { metadata: {}, body: text };
  }
  const metadataBlock = text.slice(4, splitIndex);
  const body = text.slice(splitIndex + 5);
  const metadata: Record<string, unknown> = {};
  for (const line of metadataBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!rawValue) {
      metadata[key] = "";
      continue;
    }
    try {
      metadata[key] = JSON.parse(rawValue);
    } catch {
      metadata[key] = rawValue;
    }
  }
  return { metadata, body };
}

export function renderMarkdown(
  title: string,
  metadata: Record<string, unknown>,
  sections: Array<{ heading: string; body: string }>,
): string {
  const parts = [dumpFrontMatter(metadata), "", `# ${title}`, ""];
  for (const section of sections) {
    parts.push(`## ${section.heading}`, "", section.body.trimEnd(), "");
  }
  return parts.join("\n").trimEnd() + "\n";
}

