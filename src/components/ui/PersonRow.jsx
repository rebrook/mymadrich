/**
 * PersonRow (v2 Section 6.8)
 *
 * Avatar initials (32px) + name + gold star if primary + relationship metadata
 * + trailing tel: and mailto: icon buttons.
 * No raw email/phone strings as body text.
 *
 * Props:
 *   name          – display name
 *   relationship  – relationship label (e.g., "Mother", "Tutor")
 *   email         – email address (null to hide mail button)
 *   phone         – phone number (null to hide phone button)
 *   isPrimary     – boolean, shows gold star and "Primary contact" metadata
 *   avatarColor   – optional background color for the avatar circle
 */
export default function PersonRow({
  name,
  relationship,
  email,
  phone,
  isPrimary = false,
  avatarColor,
}) {
  if (!name) return null;

  const initials = name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="person-row">
      <div
        className="person-row-avatar"
        aria-hidden="true"
        style={avatarColor ? { backgroundColor: avatarColor } : undefined}
      >
        {initials}
      </div>
      <div className="person-row-info">
        <span className="person-row-name">
          {name}
          {isPrimary && (
            <span className="person-row-star" aria-label="Primary contact">{'\u2605'}</span>
          )}
        </span>
        <span className="person-row-meta">
          {relationship}
          {isPrimary && (
            <>
              <span className="person-row-meta-dot" aria-hidden="true">{'\u00B7'}</span>
              Primary contact
            </>
          )}
        </span>
      </div>
      <div className="person-row-actions">
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            className="person-row-action-btn"
            aria-label={`Call ${name}`}
            title={phone}
          >
            <PhoneIcon />
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="person-row-action-btn"
            aria-label={`Email ${name}`}
            title={email}
          >
            <MailIcon />
          </a>
        )}
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.2 7.4a7.5 7.5 0 0 0 2.4 2.4l1.1-.8a.8.8 0 0 1 .9 0l2 1.3a.8.8 0 0 1 .2 1.1l-.9 1.2a1.6 1.6 0 0 1-1.7.5A12 12 0 0 1 2.9 5.8a1.6 1.6 0 0 1 .5-1.7l1.2-.9a.8.8 0 0 1 1.1.2l1.3 2a.8.8 0 0 1 0 .9z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <polyline points="2,4.5 8,9 14,4.5" />
    </svg>
  );
}
