import { useEffect } from 'react';

/**
 * Sets document.title to "{title} - MyMadrich" (or just "MyMadrich"
 * when no title is provided).
 *
 * Note: No cleanup/restore of the previous title. With
 * createBrowserRouter (data router), cleanup from the outgoing page
 * can fire after the incoming page's effect, overwriting the new
 * title. Each page simply declares its own title on mount.
 */
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} - MyMadrich` : 'MyMadrich';
  }, [title]);
}
