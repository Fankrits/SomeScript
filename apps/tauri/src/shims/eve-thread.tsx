// Placeholder for the Eve chat panel. The AI assistant returns as bring-your-own-key;
// this is the seam where that thread plugs in (same props as components/chat/eve-thread).
export function EveThread(_props: {
  threadId: string;
  projectId: string;
  onTitleChange: (title: string) => void;
  openFile: string | null;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      The AI assistant is coming soon. It will work with your own API key.
    </div>
  );
}
