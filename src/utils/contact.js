/**
 * Who people are told to contact for account problems (no account for an email, a deactivated
 * account, a sign-in that was turned away). One place, so the name and email are never spelled
 * differently on different screens.
 *
 * The database message for an uninvited sign-up (hook_before_user_created) holds the same email
 * as plain text; if this changes, update that message too.
 */
export const COORDINATOR = {
  name: 'Archer Davis',
  email: 'adavis@chizukamuno.org',
};
