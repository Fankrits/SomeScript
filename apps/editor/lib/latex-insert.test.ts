import { expect, test } from "bun:test";
import { buildInsertion } from "./latex-insert";

test("wraps a selection inside the braces instead of overwriting it", () => {
  const r = buildInsertion("\\textbf{}", "Navier", -1);
  expect(r.text).toBe("\\textbf{Navier}");
  expect(r.anchor).toBe(8); // just after the {
  expect(r.head).toBe(14); // ...through the wrapped text
});

test("empty selection just drops the caret at the offset", () => {
  const r = buildInsertion("\\textbf{}", "", -1);
  expect(r.text).toBe("\\textbf{}");
  expect(r.anchor).toBe(8);
  expect(r.head).toBe(8);
});

test("block environments wrap the selection at the content slot", () => {
  const r = buildInsertion("\\begin{itemize}\n  \\item \n\\end{itemize}", "milk", -14);
  expect(r.text).toContain("\\item milk");
});

test("plain insert with no selection drops the caret at the end", () => {
  const r = buildInsertion("\\sum_{i=1}^{n}", "", 0);
  expect(r.text).toBe("\\sum_{i=1}^{n}");
  expect(r.anchor).toBe(14);
  expect(r.head).toBe(14);
});
