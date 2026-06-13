const STAFF_USERNAME_PATTERN = /^ANC-[A-Z2-9]{8}$/;
const INTERNAL_LOGIN_DOMAIN = 'accounts.anc.invalid';

export function normalizeStaffUsername(value) {
  return String(value || '').trim().toUpperCase();
}

export function isStaffUsername(value) {
  return STAFF_USERNAME_PATTERN.test(normalizeStaffUsername(value));
}

export function loginIdentifier(value) {
  const trimmed = String(value || '').trim();
  if (!isStaffUsername(trimmed)) return trimmed;
  return `${normalizeStaffUsername(trimmed).toLowerCase()}@${INTERNAL_LOGIN_DOMAIN}`;
}

export function classifySessionUser(user, ownerId) {
  if (!user?.id) return 'unknown';
  if (user.id === ownerId) return 'owner';

  const metadata = user.app_metadata;
  if (
    metadata?.account_type === 'temporary_data_entry'
    && metadata?.clinic_owner_id === ownerId
  ) {
    return 'temporary';
  }
  return 'unauthorized';
}
