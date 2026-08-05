import {
  ALargeSmall,
  AlignCenter,
  AlignLeft,
  ArrowUpRight,
  Asterisk,
  Bold,
  Book,
  BookOpen,
  Braces,
  CheckCircle,
  Code,
  Divide,
  Equal,
  FileImage,
  FileText,
  GraduationCap,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTree,
  type LucideIcon,
  Milestone,
  NotebookText,
  Pi,
  Pilcrow,
  Quote,
  Radical,
  Sigma,
  Spline,
  SquareFunction,
  StickyNote,
  Subscript,
  Superscript,
  Table,
  Terminal,
  Underline,
} from "lucide-react";

export interface ToolItem {
  icon?: LucideIcon;
  label: string;
  text: string;
  cursorOffset?: number;
  /** Display-only shortcut hint, e.g. "⌘B". Wiring lives in use-codemirror-extensions.ts. */
  shortcut?: string;
  /** When set, the button lights up while the caret sits inside this construct (see activeFormats). */
  activeId?: string;
}

export interface ToolGroup {
  id: string;
  /** Human title used as the command-palette section heading. */
  title: string;
  /** Fold into the "More" overflow menu when the toolbar is cramped. */
  low?: boolean;
  /** Always-visible icon buttons (highest-frequency actions). */
  primary?: ToolItem[];
  /** Items behind the caret dropdown. */
  menu?: ToolItem[];
  /** Tooltip / a11y label for the caret trigger. */
  menuLabel?: string;
  /** When set, the trigger shows this text (e.g. "Insert") instead of caret-only. */
  menuTriggerLabel?: string;
  menuTriggerIcon?: LucideIcon;
}

// Ordered left→right by how often LaTeX authors reach for them. Primary actions
// are one click; the long tail sits behind each group's caret. Compile is the
// #1 action but already lives in the app header, so it stays out of here.
// Shared by the toolbar and the ⌘K command palette so they never drift.
export const GROUPS: ToolGroup[] = [
  {
    id: "format",
    title: "Format",
    primary: [
      {
        icon: Bold,
        label: "Bold",
        text: "\\textbf{}",
        cursorOffset: -1,
        shortcut: "⌘B",
        activeId: "bold",
      },
      {
        icon: Italic,
        label: "Italic",
        text: "\\textit{}",
        cursorOffset: -1,
        shortcut: "⌘I",
        activeId: "italic",
      },
    ],
    menuLabel: "More formatting",
    menu: [
      {
        icon: Underline,
        label: "Underline",
        text: "\\underline{}",
        cursorOffset: -1,
        shortcut: "⌘U",
      },
      { icon: Asterisk, label: "Emphasis", text: "\\emph{}", cursorOffset: -1 },
      { icon: Code, label: "Typewriter", text: "\\texttt{}", cursorOffset: -1 },
      { icon: ALargeSmall, label: "Small caps", text: "\\textsc{}", cursorOffset: -1 },
    ],
  },
  {
    id: "structure",
    title: "Structure",
    primary: [{ icon: Heading1, label: "Section", text: "\\section{}", cursorOffset: -1 }],
    menuLabel: "Headings",
    menu: [
      { icon: Heading2, label: "Subsection", text: "\\subsection{}", cursorOffset: -1 },
      { icon: Heading3, label: "Subsubsection", text: "\\subsubsection{}", cursorOffset: -1 },
      { icon: Pilcrow, label: "Paragraph", text: "\\paragraph{}", cursorOffset: -1 },
      { icon: BookOpen, label: "Part", text: "\\part{}", cursorOffset: -1 },
      { icon: Book, label: "Chapter", text: "\\chapter{}", cursorOffset: -1 },
    ],
  },
  {
    id: "math",
    title: "Math",
    primary: [
      {
        icon: Sigma,
        label: "Inline math",
        text: "$ $",
        cursorOffset: -1,
        shortcut: "⌘M",
        activeId: "math",
      },
    ],
    menuLabel: "Math",
    menuTriggerIcon: Pi,
    menu: [
      {
        icon: SquareFunction,
        label: "Display math",
        text: "\\[\n  \n\\]",
        cursorOffset: -3,
        shortcut: "⌘⇧M",
      },
      {
        icon: Equal,
        label: "Equation",
        text: "\\begin{equation}\n  \n\\end{equation}",
        cursorOffset: -15,
      },
      {
        icon: AlignLeft,
        label: "Align",
        text: "\\begin{align}\n  \n\\end{align}",
        cursorOffset: -12,
      },
      { icon: Divide, label: "Fraction", text: "\\frac{}{}", cursorOffset: -3 },
      { icon: Radical, label: "Square root", text: "\\sqrt{}", cursorOffset: -1 },
      { icon: Subscript, label: "Subscript", text: "_{}", cursorOffset: -1 },
      { icon: Superscript, label: "Superscript", text: "^{}", cursorOffset: -1 },
      { icon: Sigma, label: "Sum", text: "\\sum_{i=1}^{n}", cursorOffset: 0 },
      { icon: Spline, label: "Integral", text: "\\int_{a}^{b}", cursorOffset: 0 },
      { icon: InfinityIcon, label: "Limit", text: "\\lim_{x \\to \\infty}", cursorOffset: 0 },
    ],
  },
  {
    id: "lists",
    title: "Lists",
    primary: [
      {
        icon: List,
        label: "Bullet list",
        text: "\\begin{itemize}\n  \\item \n\\end{itemize}",
        cursorOffset: -14,
      },
      {
        icon: ListOrdered,
        label: "Numbered list",
        text: "\\begin{enumerate}\n  \\item \n\\end{enumerate}",
        cursorOffset: -16,
      },
    ],
    menuLabel: "Environments",
    menuTriggerIcon: Braces,
    menu: [
      {
        icon: ListTree,
        label: "Description",
        text: "\\begin{description}\n  \\item[] \n\\end{description}",
        cursorOffset: -18,
      },
      { icon: Quote, label: "Quote", text: "\\begin{quote}\n\n\\end{quote}", cursorOffset: -12 },
      {
        icon: Terminal,
        label: "Verbatim",
        text: "\\begin{verbatim}\n\n\\end{verbatim}",
        cursorOffset: -14,
      },
      {
        icon: AlignCenter,
        label: "Center",
        text: "\\begin{center}\n\n\\end{center}",
        cursorOffset: -13,
      },
      {
        icon: GraduationCap,
        label: "Theorem",
        text: "\\begin{theorem}\n\n\\end{theorem}",
        cursorOffset: -14,
      },
      {
        icon: CheckCircle,
        label: "Proof",
        text: "\\begin{proof}\n\n\\end{proof}",
        cursorOffset: -12,
      },
      {
        icon: NotebookText,
        label: "Abstract",
        text: "\\begin{abstract}\n\n\\end{abstract}",
        cursorOffset: -15,
      },
    ],
  },
  {
    id: "insert",
    title: "Insert",
    low: true,
    menuTriggerLabel: "Insert",
    menuTriggerIcon: ImageIcon,
    menuLabel: "Insert",
    menu: [
      {
        icon: ImageIcon,
        label: "Figure",
        text: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}",
        cursorOffset: -38,
      },
      {
        icon: FileImage,
        label: "Image",
        text: "\\includegraphics[width=\\textwidth]{}",
        cursorOffset: -1,
      },
      {
        icon: Table,
        label: "Table",
        text: "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{|c|c|}\n    \\hline\n    Header 1 & Header 2 \\\\\n    \\hline\n    Cell 1 & Cell 2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{}\n  \\label{tab:}\n\\end{table}",
        cursorOffset: -15,
      },
      { icon: Link, label: "Hyperlink", text: "\\href{url}{text}", cursorOffset: -5 },
      { icon: StickyNote, label: "Footnote", text: "\\footnote{}", cursorOffset: -1 },
      { icon: FileText, label: "Input file", text: "\\input{}", cursorOffset: -1 },
    ],
  },
  {
    id: "references",
    title: "References",
    low: true,
    primary: [{ icon: BookOpen, label: "Citation", text: "\\cite{}", cursorOffset: -1 }],
    menuLabel: "References",
    menuTriggerIcon: Hash,
    menu: [
      { icon: ArrowUpRight, label: "Reference", text: "\\ref{}", cursorOffset: -1 },
      { icon: Equal, label: "Equation reference", text: "\\eqref{}", cursorOffset: -1 },
      { icon: Milestone, label: "Page reference", text: "\\pageref{}", cursorOffset: -1 },
      { icon: Hash, label: "Label", text: "\\label{}", cursorOffset: -1 },
    ],
  },
];

export interface LatexSymbol {
  label: string;
  /** LaTeX inserted at the cursor. */
  text: string;
  /** Unicode glyph shown in the palette. */
  preview: string;
  cursorOffset?: number;
  /** Extra search terms so e.g. "≤" is found by "less than". */
  keywords?: string;
}

// Curated common-symbol table for the ⌘K palette — the long tail a fixed toolbar
// can't hold. Data, not a parser, so hand-authored is fine; extend as needed.
export const LATEX_SYMBOLS: LatexSymbol[] = [
  // Greek (lowercase)
  { label: "alpha", text: "\\alpha", preview: "α" },
  { label: "beta", text: "\\beta", preview: "β" },
  { label: "gamma", text: "\\gamma", preview: "γ" },
  { label: "delta", text: "\\delta", preview: "δ" },
  { label: "epsilon", text: "\\epsilon", preview: "ε" },
  { label: "zeta", text: "\\zeta", preview: "ζ" },
  { label: "eta", text: "\\eta", preview: "η" },
  { label: "theta", text: "\\theta", preview: "θ" },
  { label: "lambda", text: "\\lambda", preview: "λ" },
  { label: "mu", text: "\\mu", preview: "μ" },
  { label: "nu", text: "\\nu", preview: "ν" },
  { label: "xi", text: "\\xi", preview: "ξ" },
  { label: "pi", text: "\\pi", preview: "π" },
  { label: "rho", text: "\\rho", preview: "ρ" },
  { label: "sigma", text: "\\sigma", preview: "σ" },
  { label: "tau", text: "\\tau", preview: "τ" },
  { label: "phi", text: "\\phi", preview: "φ" },
  { label: "chi", text: "\\chi", preview: "χ" },
  { label: "psi", text: "\\psi", preview: "ψ" },
  { label: "omega", text: "\\omega", preview: "ω" },
  // Greek (uppercase)
  { label: "Gamma", text: "\\Gamma", preview: "Γ" },
  { label: "Delta", text: "\\Delta", preview: "Δ" },
  { label: "Theta", text: "\\Theta", preview: "Θ" },
  { label: "Lambda", text: "\\Lambda", preview: "Λ" },
  { label: "Pi", text: "\\Pi", preview: "Π" },
  { label: "Sigma", text: "\\Sigma", preview: "Σ" },
  { label: "Phi", text: "\\Phi", preview: "Φ" },
  { label: "Psi", text: "\\Psi", preview: "Ψ" },
  { label: "Omega", text: "\\Omega", preview: "Ω" },
  // Relations
  { label: "leq", text: "\\leq", preview: "≤", keywords: "less than or equal" },
  { label: "geq", text: "\\geq", preview: "≥", keywords: "greater than or equal" },
  { label: "neq", text: "\\neq", preview: "≠", keywords: "not equal" },
  { label: "approx", text: "\\approx", preview: "≈", keywords: "approximately" },
  { label: "equiv", text: "\\equiv", preview: "≡", keywords: "equivalent" },
  { label: "sim", text: "\\sim", preview: "∼", keywords: "similar tilde" },
  { label: "propto", text: "\\propto", preview: "∝", keywords: "proportional" },
  { label: "in", text: "\\in", preview: "∈", keywords: "element of member" },
  { label: "notin", text: "\\notin", preview: "∉", keywords: "not element of" },
  { label: "subset", text: "\\subset", preview: "⊂" },
  { label: "supset", text: "\\supset", preview: "⊃" },
  // Operators
  { label: "times", text: "\\times", preview: "×", keywords: "multiply cross" },
  { label: "div", text: "\\div", preview: "÷", keywords: "divide" },
  { label: "pm", text: "\\pm", preview: "±", keywords: "plus minus" },
  { label: "cdot", text: "\\cdot", preview: "⋅", keywords: "dot product" },
  { label: "cup", text: "\\cup", preview: "∪", keywords: "union" },
  { label: "cap", text: "\\cap", preview: "∩", keywords: "intersection" },
  { label: "partial", text: "\\partial", preview: "∂", keywords: "partial derivative" },
  { label: "nabla", text: "\\nabla", preview: "∇", keywords: "gradient del" },
  { label: "infty", text: "\\infty", preview: "∞", keywords: "infinity" },
  { label: "forall", text: "\\forall", preview: "∀", keywords: "for all" },
  { label: "exists", text: "\\exists", preview: "∃", keywords: "there exists" },
  { label: "prod", text: "\\prod_{i=1}^{n}", preview: "∏", keywords: "product", cursorOffset: 0 },
  // Arrows
  { label: "rightarrow", text: "\\rightarrow", preview: "→", keywords: "to arrow" },
  { label: "leftarrow", text: "\\leftarrow", preview: "←", keywords: "arrow" },
  { label: "Rightarrow", text: "\\Rightarrow", preview: "⇒", keywords: "implies double arrow" },
  { label: "Leftrightarrow", text: "\\Leftrightarrow", preview: "⇔", keywords: "iff double arrow" },
  { label: "mapsto", text: "\\mapsto", preview: "↦", keywords: "maps to" },
  // Accents / decorations
  { label: "hat", text: "\\hat{}", preview: "x̂", cursorOffset: -1, keywords: "accent" },
  { label: "bar", text: "\\bar{}", preview: "x̄", cursorOffset: -1, keywords: "accent overline" },
  { label: "vec", text: "\\vec{}", preview: "x⃗", cursorOffset: -1, keywords: "vector accent" },
  { label: "dots", text: "\\dots", preview: "…", keywords: "ellipsis ldots" },
];
