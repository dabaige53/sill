/** Sill — 原生 HTML 字符串渲染函数（src/atoms）。所有函数返回 HTML 字符串，由调用方写入 innerHTML。 */
declare namespace Sill {
  /** Mono24 图标路径注册表：名称 → SVG 内部路径。 */
  const Glyphs: Record<string, string>;
  /** 24×24 viewBox、stroke 1.65、currentColor 的 SVG。未知名称回退到 file。 */
  function icon(name: string, size?: number): string;
  /** HTML 转义。 */
  function esc(value?: unknown): string;
  /** 44px 图标按钮（IconButton）。label 写入 aria-label。 */
  function button(glyph: string, label: string, action: string, id?: string, extra?: string, className?: string): string;
  /** 阅读进度圆环（ProgressRing），progress 0–1。 */
  function ring(progress?: number, size?: number): string;
  /** 待办选择项（CheckItem）。 */
  function checkItem(card: { id: string }, task: { id: string | number; text: string; done?: boolean }): string;
  /** 参与者头像组（Avatars）。 */
  function avatars(names?: string[]): string;
  /** 标签胶囊（TagChip）。 */
  function tagChip(tag: string, active?: boolean, action?: string): string;
  /** 无结果状态（EmptyState）。 */
  function emptyState(title: string, description: string): string;
  function timeString(ts: number): string;
  function minutes(seconds: number): string;
}
