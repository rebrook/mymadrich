import { ROLE_ORDER } from './roles';

/**
 * Helpers for the "Manage roles" dialog. Pure functions, no side effects.
 */

/**
 * Which role a person should open as, given the roles ticked in the dialog.
 * Keeps the current choice if it is still ticked; otherwise the highest-privilege ticked role.
 * Returns null when nothing is ticked.
 *
 * @param {string[]} wanted - roles ticked in the dialog
 * @param {string|null} current - the "opens as" choice so far
 */
export function defaultPrimary(wanted, current) {
  if (!wanted || wanted.length === 0) return null;
  if (current && wanted.includes(current)) return current;
  return ROLE_ORDER.find((r) => wanted.includes(r)) || null;
}

/**
 * Turns the dialog's choices into the steps to run, in a safe order:
 *   1. grant the roles being added   (a person is never left without a role)
 *   2. change the "opens as" role    (only to a role they will hold)
 *   3. remove the roles being dropped
 * Each step is { rpc, role }, where rpc is 'grant_role', 'set_primary_role' or 'revoke_role'.
 * Returns an empty list when nothing changes.
 *
 * @param {object} args
 * @param {string[]} args.held - roles the person holds now
 * @param {string[]} args.wanted - roles ticked in the dialog
 * @param {string} args.primary - their current primary ("opens as") role
 * @param {string|null} args.wantedPrimary - the "opens as" choice in the dialog
 */
export function planRoleChanges({ held, wanted, primary, wantedPrimary }) {
  const heldSet = new Set(held || []);
  const wantedSet = new Set(wanted || []);
  const steps = [];

  ROLE_ORDER.forEach((role) => {
    if (wantedSet.has(role) && !heldSet.has(role)) steps.push({ rpc: 'grant_role', role });
  });

  const finalPrimary = defaultPrimary(wanted || [], wantedPrimary);
  if (finalPrimary && finalPrimary !== primary) {
    steps.push({ rpc: 'set_primary_role', role: finalPrimary });
  }

  ROLE_ORDER.forEach((role) => {
    if (heldSet.has(role) && !wantedSet.has(role)) steps.push({ rpc: 'revoke_role', role });
  });

  return steps;
}
