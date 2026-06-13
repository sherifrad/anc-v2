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

export function temporaryOnboardingState(user, currentLevel) {
  if (currentLevel !== 'aal2') return 'mfa_required';
  if (user?.app_metadata?.must_change_password !== false) {
    return 'password_change_required';
  }
  if (user?.app_metadata?.onboarding_complete !== true) {
    return 'onboarding_incomplete';
  }
  return 'waiting_for_owner';
}

export function passwordValidationError(password, confirmation, username = '') {
  const value = String(password || '');
  if (value.length < 16) return 'Use at least 16 characters.';
  if (!/[A-Z]/.test(value)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(value)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(value)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Add at least one symbol.';
  if (value !== String(confirmation || '')) return 'The passwords do not match.';

  const normalizedUsername = normalizeStaffUsername(username);
  if (
    normalizedUsername
    && value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      .includes(normalizedUsername.replace(/[^A-Za-z0-9]/g, ''))
  ) {
    return 'The password must not contain the staff username.';
  }
  return '';
}
