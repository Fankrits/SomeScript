import { expect, test } from "bun:test"
import { getLatexOutline, nestOutline } from "./latex-outline"

test("extracts nested headings in document order with levels and line numbers", () => {
  const content = "\\chapter{One}\n\\section{Intro}\n\\subsection{Background}\n\\section{Second}\n"
  const outline = getLatexOutline(content)
  expect(outline).toEqual([
    { level: 2, title: "One", line: 1 },
    { level: 3, title: "Intro", line: 2 },
    { level: 4, title: "Background", line: 3 },
    { level: 3, title: "Second", line: 4 },
  ])
})

test("ignores commented-out headings", () => {
  const content = "% \\section{Should be ignored}\n\\section{Real}\n"
  expect(getLatexOutline(content)).toEqual([{ level: 3, title: "Real", line: 2 }])
})

test("strips starred and optional-arg forms down to the title", () => {
  const content = "\\section*{Starred}\n\\section[Short]{Long Title}\n"
  expect(getLatexOutline(content)).toEqual([
    { level: 3, title: "Starred", line: 1 },
    { level: 3, title: "Long Title", line: 2 },
  ])
})

test("returns nothing for a document with no sectioning commands", () => {
  expect(getLatexOutline("just some text\n")).toEqual([])
})

test("returns nothing for empty content", () => {
  expect(getLatexOutline("")).toEqual([])
})

test("nests entries under their nearest shallower-level ancestor", () => {
  const tree = nestOutline([
    { level: 3, title: "One", line: 1 },
    { level: 4, title: "One.a", line: 2 },
    { level: 4, title: "One.b", line: 3 },
    { level: 3, title: "Two", line: 4 },
  ])
  expect(tree).toEqual([
    {
      level: 3, title: "One", line: 1, children: [
        { level: 4, title: "One.a", line: 2, children: [] },
        { level: 4, title: "One.b", line: 3, children: [] },
      ]
    },
    { level: 3, title: "Two", line: 4, children: [] },
  ])
})

test("nests a level jump deeper than one step under the last seen ancestor", () => {
  const tree = nestOutline([
    { level: 3, title: "Section", line: 1 },
    { level: 6, title: "Deep paragraph", line: 2 },
  ])
  expect(tree[0].children[0].title).toBe("Deep paragraph")
})
