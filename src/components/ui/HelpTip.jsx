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
    <span className="help-tip">
      <button type="button" className="help-tip-icon" aria-label={text}>i</button>
      <span className="help-tip-text" aria-hidden="true">{text}</span>
    </span>
  );
}
