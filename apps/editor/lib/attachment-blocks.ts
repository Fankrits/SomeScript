/**
 * Display-side parser for the wire format @assistant-ui's
 * SimpleTextAttachmentAdapter emits on send:
 *
 *   <attachment name=NAME>\nBODY\n</attachment>
 *
 * The format is unquoted and undelimited, so plain non-greedy matching breaks
 * on two real inputs: a NAME containing ">" and a BODY containing the literal
 * line "</attachment>" (e.g. attaching a log of this very chat). Two hardenings:
 *
 * - NAME matches greedily to the *last* ">" on its line.
 * - The closing tag only counts when followed by end-of-text or another
 *   opening tag. Adapters append attachments after the user's text, so a
 *   premature "</attachment>" inside a body never sits in that position.
 */
const ATTACHMENT_BLOCK =
  /<attachment name=(.*)>\n([\s\S]*?)\n<\/attachment>(?=\s*(?:<attachment name=|$))/g;

export interface AttachmentBlock {
  name: string;
  body: string;
}

/** Split a message text into visible text and the attachment blocks it carried. */
export function extractAttachmentBlocks(text: string): {
  text: string;
  blocks: AttachmentBlock[];
} {
  const blocks: AttachmentBlock[] = [];
  const stripped = text
    .replace(ATTACHMENT_BLOCK, (_match: string, name: string, body: string) => {
      blocks.push({ name, body });
      return "";
    })
    .trim();
  return { text: stripped, blocks };
}
