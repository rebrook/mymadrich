/**
 * mailto: link builder for MyMadrich coordinator communications.
 *
 * Pure functions — no side effects, no API calls, no sending.
 * Each function returns a mailto: URL string that opens the user's
 * default mail client with a pre-filled subject and body.
 *
 * Privacy: every link is single-recipient. No CC, no BCC, no family
 * email ever exposed to another family.
 */

import { formatSessionDate } from './datetime';

// ---- Internal helpers ----

/**
 * Builds a mailto: URL with encoded subject and body.
 * @param {string} to - Single recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} body - Email body text.
 * @returns {string} A mailto: URL string, or '' if no email provided.
 */
function buildMailto(to, subject, body) {
  if (!to) return '';
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams encodes spaces as '+'; mailto: needs '%20'
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * Extracts a first-name-only greeting from a full display name.
 * "Rachel Mirsky" → "Rachel", "Rachel" → "Rachel".
 * @param {string} name
 * @returns {string}
 */
function firstName(name) {
  if (!name) return '';
  return name.trim().split(/\s+/)[0];
}

/**
 * Formats a date string for use in email body text.
 * Returns a human-readable date like "Sunday, July 12, 2026".
 * @param {string|null} dateStr - ISO date string.
 * @returns {string}
 */
function emailDate(dateStr) {
  return formatSessionDate(dateStr, { style: 'date' });
}

/**
 * Formats a short date for subject lines.
 * Returns "Jul 12, 2026".
 * @param {string|null} dateStr - ISO date string.
 * @returns {string}
 */
function emailDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Public API ----

/**
 * Nudge Tutor: gentle check-in when a student's last session is stale.
 *
 * @param {Object} opts
 * @param {string} opts.tutorEmail - Tutor's email address.
 * @param {string} opts.tutorDisplayName - Tutor's display name.
 * @param {string} opts.studentFullName - Student's full name.
 * @param {string|null} opts.lastSessionDate - ISO date of last session.
 * @returns {string} mailto: URL, or '' if no tutor email.
 */
export function buildNudgeTutorMailto({ tutorEmail, tutorDisplayName, studentFullName, lastSessionDate }) {
  const tutorFirst = firstName(tutorDisplayName);
  const since = lastSessionDate
    ? emailDateShort(lastSessionDate)
    : 'some time ago';

  const subject = `${studentFullName}: session check-in`;
  const body = [
    `Hi ${tutorFirst},`,
    '',
    `${studentFullName} hasn't had a logged session since ${since}. Is everything on track? Please log a session or let me know if there's anything I can help with.`,
    '',
    'Thank you,',
    '',
  ].join('\n');

  return buildMailto(tutorEmail, subject, body);
}

/**
 * Caseload Nudge: check in with a tutor about their overall caseload
 * (not tied to a specific student). Used from the By Tutor lens.
 *
 * @param {Object} opts
 * @param {string} opts.tutorEmail - Tutor's email address.
 * @param {string} opts.tutorDisplayName - Tutor's display name.
 * @param {number} opts.studentCount - Number of students in the caseload.
 * @param {string|null} opts.lastSessionDate - Most recent session across caseload.
 * @returns {string} mailto: URL, or '' if no tutor email.
 */
export function buildCaseloadNudgeMailto({ tutorEmail, tutorDisplayName, studentCount, lastSessionDate }) {
  const tutorFirst = firstName(tutorDisplayName);
  const since = lastSessionDate
    ? emailDateShort(lastSessionDate)
    : null;

  const subject = 'Caseload check-in';
  const sinceClause = since
    ? `The most recent session across your ${studentCount} student${studentCount === 1 ? '' : 's'} was on ${since}.`
    : `It looks like it's been a while since sessions were logged for your ${studentCount} student${studentCount === 1 ? '' : 's'}.`;

  const body = [
    `Hi ${tutorFirst},`,
    '',
    `Just checking in on how things are going. ${sinceClause} Is everything on track? Let me know if there's anything I can help with.`,
    '',
    'Thank you,',
    '',
  ].join('\n');

  return buildMailto(tutorEmail, subject, body);
}

/**
 * Family Check-in: reach out when a student is behind pace.
 *
 * @param {Object} opts
 * @param {string} opts.guardianEmail - Primary guardian's email.
 * @param {string} opts.guardianName - Guardian's display name.
 * @param {string} opts.studentFirstName - Student's first name.
 * @param {string|null} opts.bimahDate - ISO date of B'nai Mitzvah.
 * @returns {string} mailto: URL, or '' if no guardian email.
 */
export function buildFamilyCheckinMailto({ guardianEmail, guardianName, studentFirstName, bimahDate }) {
  const guardianFirst = firstName(guardianName);
  const dateStr = bimahDate ? emailDate(bimahDate) : 'the upcoming date';

  const subject = `${studentFirstName}'s B'nai Mitzvah preparation`;
  const body = [
    `Hi ${guardianFirst},`,
    '',
    `I wanted to touch base about ${studentFirstName}'s preparation for their B'nai Mitzvah on ${dateStr}. They're a bit behind the pace we'd like to see at this point, and I'd love to connect about how we can help.`,
    '',
    'Would you have a few minutes to chat this week?',
    '',
  ].join('\n');

  return buildMailto(guardianEmail, subject, body);
}

/**
 * Upcoming Date Reminder: friendly heads-up as the date approaches.
 *
 * @param {Object} opts
 * @param {string} opts.guardianEmail - Primary guardian's email.
 * @param {string} opts.guardianName - Guardian's display name.
 * @param {string} opts.studentFirstName - Student's first name.
 * @param {string|null} opts.bimahDate - ISO date of B'nai Mitzvah.
 * @param {number} opts.daysUntil - Days until the date.
 * @returns {string} mailto: URL, or '' if no guardian email.
 */
export function buildUpcomingReminderMailto({ guardianEmail, guardianName, studentFirstName, bimahDate, daysUntil }) {
  const guardianFirst = firstName(guardianName);
  const dateStr = bimahDate ? emailDate(bimahDate) : 'soon';

  const subject = `${studentFirstName}'s B'nai Mitzvah is ${daysUntil} days away!`;
  const body = [
    `Hi ${guardianFirst},`,
    '',
    `Just a friendly reminder that ${studentFirstName}'s B'nai Mitzvah is ${daysUntil} days away, on ${dateStr}. If you have any questions about preparation, logistics, or anything else, please don't hesitate to reach out.`,
    '',
    `We're looking forward to celebrating with your family!`,
    '',
  ].join('\n');

  return buildMailto(guardianEmail, subject, body);
}

/**
 * Resolves the primary guardian's email for a student.
 * Returns the first primary guardian with an email, or the first guardian
 * with an email, or null.
 *
 * @param {Array} guardians - Array of guardian objects from the student query.
 * @returns {{ name: string, email: string } | null}
 */
export function resolvePrimaryGuardianContact(guardians) {
  if (!guardians || guardians.length === 0) return null;

  // Prefer primary guardian with an email
  const primary = guardians.find((g) => g.is_primary && g.email);
  if (primary) return { name: primary.name, email: primary.email };

  // Fall back to any guardian with an email
  const withEmail = guardians.find((g) => g.email);
  if (withEmail) return { name: withEmail.name, email: withEmail.email };

  return null;
}

/**
 * Tutor → Family: session reminder / general check-in.
 *
 * Opens a pre-filled email addressed to the primary guardian.
 * Subject: "{Student first}'s upcoming session — {formatted date}"
 * Body: greeting, session date/time, gentle reminder, sign-off.
 *
 * @param {Object} opts
 * @param {string} opts.guardianEmail - Primary guardian's email.
 * @param {string} opts.guardianName - Guardian's display name.
 * @param {string} opts.studentFirstName - Student's first name.
 * @param {string} opts.tutorDisplayName - Tutor's display name (for sign-off).
 * @param {string|null} opts.sessionDate - ISO date of upcoming session.
 * @param {string|null} opts.sessionTime - Time string "HH:MM" or null.
 * @returns {string} mailto: URL, or '' if no guardian email.
 */
export function buildTutorSessionMailto({
  guardianEmail,
  guardianName,
  studentFirstName,
  tutorDisplayName,
  sessionDate,
  sessionTime,
}) {
  const guardianFirst = firstName(guardianName);
  const tutorFirst = firstName(tutorDisplayName);

  // Format date with optional time
  let dateDisplay;
  if (sessionDate && sessionTime) {
    dateDisplay = formatSessionDate(`${sessionDate}T${sessionTime}`, { style: 'long' });
  } else if (sessionDate) {
    dateDisplay = formatSessionDate(sessionDate, { style: 'date' });
  } else {
    dateDisplay = 'an upcoming date';
  }

  const shortDate = sessionDate
    ? formatSessionDate(sessionDate, { style: 'date' })
    : '';

  const subject = shortDate
    ? `${studentFirstName}'s upcoming session: ${shortDate}`
    : `${studentFirstName}'s upcoming session`;

  const body = [
    `Hi ${guardianFirst},`,
    '',
    `Just a reminder that ${studentFirstName} has a tutoring session on ${dateDisplay}. We'll keep working on this week's practice. If that time doesn't work, let me know and we'll reschedule.`,
    '',
    'Thank you,',
    tutorFirst || '',
    '',
  ].join('\n');

  return buildMailto(guardianEmail, subject, body);
}

// ---- Invitation Auto-Send ----

/** App URL used in invite messages. Env var with fallback. */
const APP_URL = import.meta.env.VITE_APP_URL
  || window.location.origin;

/**
 * Builds a mailto: URL that opens the admin's mail client with a
 * pre-filled invitation message for a new tutor, parent, or student.
 *
 * @param {Object} opts
 * @param {string} opts.recipientEmail - The invitee's email address.
 * @param {string} opts.recipientName - The invitee's display name.
 * @param {string} opts.role - 'tutor' | 'parent' | 'student'
 * @returns {string} mailto: URL, or '' if no email provided.
 */
export function buildInviteMailto({ recipientEmail, recipientName, role }) {
  const recipientFirst = firstName(recipientName);
  // A pending invitation can exist without a name; avoid opening with "Hi ,"
  const greeting = recipientFirst ? `Hi ${recipientFirst},` : 'Hello,';
  const roleLabel = role === 'tutor' ? 'tutor'
    : role === 'parent' ? 'family member'
    : 'student';

  const subject = `You\u2019ve been invited to MyMadrich`;
  const body = [
    greeting,
    '',
    `You\u2019ve been invited to MyMadrich, the B\u2019nai Mitzvah tutoring progress tracker for Chizuk Amuno Congregation, as a ${roleLabel}.`,
    '',
    `To get started, visit the link below and sign in with your Google account (or use the magic link option to sign in with your email address):`,
    APP_URL,
    '',
    `If you have any questions, please reach out to your B\u2019nai Mitzvah coordinator.`,
    '',
  ].join('\n');

  return buildMailto(recipientEmail, subject, body);
}

/**
 * Opens the admin's mail client with a pre-filled invitation.
 * Call this after inserting the pending_invitations row.
 *
 * @param {Object} opts - Same as buildInviteMailto.
 */
export function openInviteEmail(opts) {
  const url = buildInviteMailto(opts);
  if (url) window.open(url, '_blank');
}
