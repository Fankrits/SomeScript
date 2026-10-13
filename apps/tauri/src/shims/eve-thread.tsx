// Replaces apps/editor/components/chat/eve-thread (the cloud assistant, which needs the hosted
// Eve backend). The desktop chat is `../chat`: a bring-your-own-key assistant whose model calls
// are made by the Rust server, so API keys never reach the page.
import { ChatThread } from "../chat/chat-thread";

export function EveThread(props: {
  threadId: string;
  projectId: string;
  onTitleChange: (title: string) => void;
  openFile?: string | null;
}) {
  return <ChatThread {...props} openFile={props.openFile ?? null} />;
}
