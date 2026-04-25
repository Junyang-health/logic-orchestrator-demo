/**
 * Stack canvas + absolutely positioned assistant overlay. Must be `flex-col` — a default `flex` row
 * places siblings side-by-side and can collapse the graph to zero or narrow width.
 */
export default function AssistantAndCanvasRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-full w-full min-h-0 min-w-0 flex-1 flex-col">{children}</div>
  );
}
