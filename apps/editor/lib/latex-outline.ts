import { parser } from "codemirror-lang-latex";

export interface OutlineEntry {
  level: number;
  title: string;
  line: number;
}

// codemirror-lang-latex's grammar nests each sectioning macro (\part..\subparagraph)
// as its own node spanning from that heading to the start of the next same-or-higher
// heading, with a `SectioningCommand` child holding the macro + its title argument.
// Reusing that parser (already a dependency, used for editor syntax highlighting)
// means comments, verbatim blocks, and starred/optional-arg forms (\section*,
// \section[Short]{Long}) are handled for free instead of re-implemented via regex.
const SECTION_LEVELS: Record<string, number> = {
  Book: 0,
  Part: 1,
  Chapter: 2,
  Section: 3,
  SubSection: 4,
  SubSubSection: 5,
  Paragraph: 6,
  SubParagraph: 7,
};

export function getLatexOutline(content: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const cursor = parser.parse(content).cursor();
  do {
    const level = SECTION_LEVELS[cursor.name];
    if (level === undefined) continue;
    const cmd = cursor.node.getChild("SectioningCommand");
    if (!cmd) continue;
    const text = content.slice(cmd.from, cmd.to);
    const braceStart = text.indexOf("{");
    const rawTitle = braceStart >= 0 ? text.slice(braceStart + 1, -1) : text;
    entries.push({
      level,
      title: rawTitle.replace(/\s+/g, " ").trim() || "Untitled",
      line: content.slice(0, cmd.from).split("\n").length,
    });
  } while (cursor.next());
  return entries;
}

export interface OutlineNode extends OutlineEntry {
  children: OutlineNode[];
}

// Turns the flat, level-annotated list into a real tree (via a stack of open
// ancestors) so the panel can draw indent guides and collapse a heading's subtree.
export function nestOutline(entries: OutlineEntry[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const entry of entries) {
    const node: OutlineNode = { ...entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    (parent ? parent.children : root).push(node);
    stack.push(node);
  }
  return root;
}
