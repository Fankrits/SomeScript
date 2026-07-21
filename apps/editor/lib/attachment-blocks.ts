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
 * Eve carries an attached image as a *file* part (`text` and `file` are the
 * only part types it accepts — see parseMessagePart in
 * eve/dist/src/public/channels/eve.js), and both sides flatten that part to a
 * placeholder line, dropping the bytes:
 *
 *   client store  → "[file: photo.png]"          (eve-agent-store.js)
 *   server echo   → "[file: photo.png (image/png)]"  (protocol/message.js)
 *
 * Neither spelling is a usable anchor for finding the image again — they differ
 * per side and collide across identical filenames — so images are linked to
 * their message by {@link imageMarkerFor}, and these lines are only stripped.
 */
const PART_PLACEHOLDER = /^\[(?:file|image)(?:: [^\]\n]*)?\]$/gm;

/** Remove the placeholder lines Eve leaves where a file/image part was sent. */
export function stripPartPlaceholders(text: string): string {
  return text.replace(PART_PLACEHOLDER, "").trim();
}

/**
 * Builds the leading context marker for an outgoing message.
 *
 * The image id rides *inside* the existing "[projectId: …]" marker rather than
 * on its own line, so every consumer that already strips that line — display
 * conversion, thread titles — keeps working untouched. Text is also the only
 * part type Eve's flattening is guaranteed to preserve, which is what makes
 * this a usable anchor when the image data itself is dropped.
 */
export function imageMarkerFor(projectId: string, imageId?: string): string {
  return imageId
    ? `[projectId: ${projectId} | images: ${imageId}]`
    : `[projectId: ${projectId}]`;
}

const IMAGE_MARKER = /^\[projectId: [^\]]*\|\s*images:\s*([^\]\s]+)\]/;

/** Reads back the image id written by {@link imageMarkerFor}, if present. */
export function parseImageMarker(text: string): string | undefined {
  return IMAGE_MARKER.exec(text)?.[1];
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
  content: readonly { type: string; text?: string; image?: string }[];
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
    for (const part of attachment.content) {
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
      }
    }
  }
  return { parts, images };
}
