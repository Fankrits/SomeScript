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
 * - The closing tag only counts when followed by end-of-text, another opening
 *   tag, or a "[file: …]"/"[image: …]" placeholder (attachments trail the
 *   user's text in send order, and an attached image may come after a text
 *   file). A premature "</attachment>" inside a body never sits in one of
 *   those positions.
 */
const ATTACHMENT_BLOCK =
  /<attachment name=(.*)>\n([\s\S]*?)\n<\/attachment>(?=\s*(?:<attachment name=|\[file[:\]]|\[image: |$))/g;

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

/**
 * The optimistic message Eve renders before the server answers still flattens
 * an attachment to a placeholder line, dropping the bytes:
 *
 *   "[file: photo.png]"   (summarizeUserContent in eve-agent-store.js)
 *
 * The echoed message that replaces it a moment later carries a real `file`
 * part instead, so this only has to clean up the optimistic spelling. The
 * older server-echo spelling ("[file: photo.png (image/png)]") is still
 * matched, so threads saved before eve 0.21 keep rendering correctly.
 */
const PART_PLACEHOLDER = /^\[(?:file|image)(?:: [^\]\n]*)?\]$/gm;

/** Remove the placeholder lines Eve leaves where a file/image part was sent. */
export function stripPartPlaceholders(text: string): string {
  return text.replace(PART_PLACEHOLDER, "").trim();
}

/** "data:image/png;base64,…" → "image/png" */
export function mediaTypeOf(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/*";
}

/** The only two part types Eve's channel accepts. */
export type OutgoingPart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; data: string; filename: string };

interface AttachmentLike {
  name: string;
  // Optional in practice: the composer only fills this in once the adapter's
  // send() resolves, and iterating it blind would throw the whole turn away.
  content?: readonly {
    type: string;
    text?: string;
    image?: string;
    data?: string;
    mimeType?: string;
  }[];
}

/**
 * Converts composer attachments into parts Eve will accept.
 *
 * `text` and `file` are the only types its parser allows: anything else is
 * rejected with 400 "Unsupported message part type" before it reaches the model
 * (parseMessagePart in eve/dist/src/public/channels/eve.js). An attached image
 * therefore has to travel as a *file* part carrying its data URL — sending the
 * `{type: "image"}` part the composer produces fails the entire message.
 *
 * The returned `images` are the same pixels, for {@link imageMarkerFor} to link
 * to the message so display can re-attach them.
 */
export function attachmentsToParts(attachments: readonly AttachmentLike[]): {
  parts: OutgoingPart[];
  images: { url: string; name: string }[];
} {
  const parts: OutgoingPart[] = [];
  const images: { url: string; name: string }[] = [];
  for (const attachment of attachments) {
    for (const part of attachment.content ?? []) {
      if (part.type === "text" && part.text !== undefined) {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image" && part.image !== undefined) {
        parts.push({
          type: "file",
          mediaType: mediaTypeOf(part.image),
          data: part.image,
          filename: attachment.name,
        });
        images.push({ url: part.image, name: attachment.name });
      } else if (part.type === "file" && part.data !== undefined) {
        // Non-image documents (e.g. PDFs from SimplePdfAttachmentAdapter):
        // already a data URL, just needs its mimeType renamed to mediaType
        // for Eve's wire format.
        parts.push({
          type: "file",
          mediaType: part.mimeType ?? mediaTypeOf(part.data),
          data: part.data,
          filename: attachment.name,
        });
      }
    }
  }
  return { parts, images };
}

/**
 * Drops attachment bytes from the event log before it is persisted.
 *
 * Eve projects a sent attachment back into `message.received` as a `file` part
 * carrying the whole data URL, which is what makes the tile render without any
 * client-side bookkeeping. One photo is also most of the ~5MB localStorage
 * origin quota, so saving the log verbatim would cost the conversation to keep
 * a thumbnail. The metadata stays; only `url` goes, leaving a reloaded message
 * to render its text with no tile.
 */
export function stripEventFileData<T>(events: readonly T[]): T[] {
  // Only `message.received` carries parts; the rest of the event union has no
  // `data.parts` at all, so this reads through an unknown shape by design.
  type PartLike = { type?: string; url?: string };
  return events.map((event) => {
    const data = (event as { data?: { parts?: PartLike[] } } | null)?.data;
    const parts = data?.parts;
    if (!parts?.some((part) => part.type === "file" && part.url !== undefined)) {
      return event;
    }
    return {
      ...event,
      data: {
        ...data,
        parts: parts.map((part) => {
          if (part.type !== "file") return part;
          const stripped: PartLike = { ...part };
          delete stripped.url;
          return stripped;
        }),
      },
    };
  });
}
