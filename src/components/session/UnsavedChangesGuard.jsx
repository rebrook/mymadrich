import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import Modal from '../ui/Modal';

/**
 * Unsaved-changes guard (v2 Session D, scope item 7).
 *
 * Blocks both in-app navigation (useBlocker) and browser close/reload
 * (beforeunload). Renders a confirmation modal when the user tries to
 * navigate away with unsaved work.
 *
 * Props:
 *   isDirty – true when the form has unsaved changes
 */
export default function UnsavedChangesGuard({ isDirty }) {
  // ---- In-app navigation blocking (data router required) ----
  const blocker = useBlocker(isDirty);

  // ---- Browser close / reload blocking ----
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e) {
      e.preventDefault();
      // Legacy browsers need returnValue set
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ---- Confirmation modal ----
  if (blocker.state !== 'blocked') return null;

  return (
    <Modal
      title="Unsaved Changes"
      onClose={() => blocker.reset()}
      footer={
        <>
          <button
            className="btn btn-outline"
            onClick={() => blocker.reset()}
          >
            Stay on Page
          </button>
          <button
            className="btn btn-primary"
            onClick={() => blocker.proceed()}
          >
            Leave Without Saving
          </button>
        </>
      }
    >
      <p>You have unsaved changes that will be lost if you leave this page.</p>
    </Modal>
  );
}
