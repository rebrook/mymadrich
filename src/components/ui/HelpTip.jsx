/**
 * Contextual help tooltip.
 * Renders a small (i) icon that shows a tooltip on hover (desktop) or tap (mobile).
 * Pure CSS implementation, no library dependencies.
 *
 * Props:
 *   text - string, the tooltip content
 */
export default function HelpTip({ text }) {
  return (
    <span className="help-tip" aria-label={text}>
      <span className="help-tip-icon" tabIndex={0} role="img" aria-hidden="true">i</span>
      <span className="help-tip-text">{text}</span>
    </span>
  );
}
