import { useState } from 'react';

const STORAGE_KEY = 'mymadrich:tutor_first_run_dismissed';

const STEPS = [
  'After each lesson, log the session by rating what you worked on.',
  'Homework builds itself from what you rate.',
  'The family\u2019s dashboard and pace tracking update automatically.',
];

/**
 * Tutor first-run strip (v2 Section 14.2).
 *
 * A dismissible horizontal strip with three numbered steps explaining
 * the tutor workflow. Shown once on the tutor landing page. One-click
 * permanent dismiss, persisted in localStorage.
 */
export default function TutorFirstRunStrip() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1'
  );

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="tutor-first-run">
      <div className="tutor-first-run-header">
        <h3 className="tutor-first-run-title">How it works</h3>
        <button
          className="tutor-first-run-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss guide"
          type="button"
        >
          {'\u2715'}
        </button>
      </div>
      <ol className="tutor-first-run-steps">
        {STEPS.map((text, i) => (
          <li key={i} className="tutor-first-run-step">
            <span className="tutor-first-run-step-number" aria-hidden="true">{i + 1}</span>
            <span className="tutor-first-run-step-text">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
