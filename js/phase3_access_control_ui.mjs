import { PHASE3_SECURITY } from './phase3_security_config.mjs';
import {
  changeAccessGrant,
  createAccessGrant,
  loadAccessControlSnapshot,
} from './phase3_access_control.mjs';

const state = {
  initialized: false,
  loading: false,
  snapshot: null,
  statusFilter: 'all',
  auditFilter: 'all',
};

function element(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  return status ? status.replaceAll('_', ' ') : 'unknown';
}

function commandButtons(grant) {
  const buttons = [];
  if (['invited', 'active'].includes(grant.status)) {
    buttons.push(`
      <button type="button" class="phase3-row-action warning"
              data-phase3-action="suspend" data-grant-id="${escapeHtml(grant.id)}">
        Suspend
      </button>
    `);
  }
  if (grant.status !== 'revoked') {
    buttons.push(`
      <button type="button" class="phase3-row-action danger"
              data-phase3-action="revoke" data-grant-id="${escapeHtml(grant.id)}">
        Revoke
      </button>
    `);
  }
  return buttons.join('');
}

function filteredGrants() {
  const grants = state.snapshot?.grants || [];
  if (state.statusFilter === 'all') return grants;
  return grants.filter(grant => grant.status === state.statusFilter);
}

function filteredAudit() {
  const audit = state.snapshot?.audit || [];
  if (state.auditFilter === 'all') return audit;
  return audit.filter(event => event.outcome === state.auditFilter);
}

function renderCounts() {
  const counts = state.snapshot?.counts || {};
  element('phase3GrantTotal').textContent = counts.total ?? 0;
  element('phase3GrantActive').textContent = counts.active ?? 0;
  element('phase3GrantScheduled').textContent = counts.scheduled ?? 0;
  element('phase3GrantAttention').textContent = counts.attention ?? 0;
}

function renderGrants() {
  const container = element('phase3GrantList');
  const grants = filteredGrants();
  if (!grants.length) {
    container.innerHTML = `
      <div class="phase3-empty">
        <strong>No access grants</strong>
        <span>The secure foundation is ready. No temporary user can access clinic data.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = grants.map(grant => `
    <article class="phase3-grant-row">
      <div class="phase3-grant-main">
        <div class="phase3-grant-title">
          <strong>${escapeHtml(grant.userId)}</strong>
          <span class="phase3-badge status-${escapeHtml(grant.status)}">
            ${escapeHtml(statusLabel(grant.status))}
          </span>
        </div>
        <div class="phase3-grant-meta">
          <span>${escapeHtml(statusLabel(grant.role))}</span>
          <span>${escapeHtml(formatDate(grant.validFrom))}</span>
          <span>to ${escapeHtml(formatDate(grant.validUntil))}</span>
        </div>
        <div class="phase3-permissions">
          ${grant.permissions.map(permission => (
            `<span>${escapeHtml(permission)}</span>`
          )).join('')}
        </div>
      </div>
      <div class="phase3-grant-side">
        <span class="phase3-envelope ${escapeHtml(grant.envelopeStatus)}">
          Key envelope: ${escapeHtml(statusLabel(grant.envelopeStatus))}
        </span>
        <button type="button" class="phase3-row-action" data-phase3-action="inspect">
          Inspect
        </button>
        ${commandButtons(grant)}
      </div>
    </article>
  `).join('');
}

function renderAudit() {
  const body = element('phase3AuditBody');
  const events = filteredAudit();
  if (!events.length) {
    body.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="phase3-empty compact">
            <strong>No security events</strong>
            <span>The append-only audit container is empty.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  body.innerHTML = events.map(event => `
    <tr>
      <td data-label="Time">${escapeHtml(formatDate(event.createdAt))}</td>
      <td data-label="Event">${escapeHtml(statusLabel(event.eventType))}</td>
      <td data-label="Outcome">
        <span class="phase3-badge outcome-${escapeHtml(event.outcome)}">
          ${escapeHtml(event.outcome)}
        </span>
      </td>
      <td data-label="Assurance">${escapeHtml(event.assuranceLevel || 'Not recorded')}</td>
    </tr>
  `).join('');
}

function renderSnapshot() {
  renderCounts();
  renderGrants();
  renderAudit();
  const safety = state.snapshot?.safety || {};
  element('phase3MutationState').textContent = safety.grantMutationsEnabled
    ? 'Enabled'
    : 'Disabled';
  element('phase3DelegatedState').textContent = safety.delegatedAccessEnabled
    ? 'Enabled'
    : 'Disabled';
  element('phase3LastChecked').textContent = `Checked ${formatDate(new Date())}`;
}

function setLoading(loading) {
  state.loading = loading;
  element('phase3Refresh').disabled = loading;
  element('phase3Refresh').textContent = loading ? 'Checking...' : 'Refresh';
}

function setError(message = '') {
  const error = element('phase3PanelError');
  error.textContent = message;
  error.hidden = !message;
}

function setDialogError(id, message = '') {
  const error = element(id);
  error.textContent = message;
  error.hidden = !message;
}

function localDateTimeValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function openGrantDialog() {
  const now = new Date();
  const end = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  element('phase3GrantForm').reset();
  element('phase3ValidFrom').value = localDateTimeValue(now);
  element('phase3ValidUntil').value = localDateTimeValue(end);
  element('phase3GrantForm')
    .querySelectorAll('input[name="phase3Permission"]')
    .forEach(input => {
      input.checked = ['patients.read', 'related.read'].includes(input.value);
    });
  setDialogError('phase3GrantFormError');
  element('phase3GrantDialog').hidden = false;
  element('phase3GranteeId').focus();
}

function closeGrantDialog() {
  element('phase3GrantDialog').hidden = true;
}

function openStateDialog(grantId, action) {
  const irreversible = action === 'revoke';
  element('phase3StateGrantId').value = grantId;
  element('phase3StateAction').value = action;
  element('phase3StateReason').value = '';
  element('phase3StateTitle').textContent = irreversible
    ? 'Revoke access grant'
    : 'Suspend access grant';
  element('phase3StateCopy').textContent = irreversible
    ? 'Revocation is permanent. This draft cannot be restored or activated later.'
    : 'Suspension blocks this grant. Reactivation is not available in the current release.';
  element('phase3StateSubmit').textContent = irreversible
    ? 'Revoke permanently'
    : 'Suspend grant';
  setDialogError('phase3StateError');
  element('phase3StateDialog').hidden = false;
  element('phase3StateReason').focus();
}

function closeStateDialog() {
  element('phase3StateDialog').hidden = true;
}

function setButtonBusy(id, busy, idleText, busyText) {
  const button = element(id);
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

async function refresh() {
  if (state.loading) return;
  setLoading(true);
  setError();
  try {
    state.snapshot = await loadAccessControlSnapshot({
      client: AUTH.getClient(),
      session: await AUTH.getSecuritySession(),
    });
    renderSnapshot();
  } catch (error) {
    console.error('Phase 3 panel failed:', error);
    setError(error.message || 'The security panel could not be loaded.');
  } finally {
    setLoading(false);
  }
}

async function submitGrant(event) {
  event.preventDefault();
  setDialogError('phase3GrantFormError');
  setButtonBusy('phase3GrantSubmit', true, 'Create draft', 'Creating...');
  try {
    const permissions = [...element('phase3GrantForm').querySelectorAll(
      'input[name="phase3Permission"]:checked',
    )].map(input => input.value);
    await createAccessGrant({
      client: AUTH.getClient(),
      session: await AUTH.getSecuritySession(),
      granteeUserId: element('phase3GranteeId').value,
      permissions,
      validFrom: element('phase3ValidFrom').value,
      validUntil: element('phase3ValidUntil').value,
      deviceHint: navigator.userAgent,
    });
    closeGrantDialog();
    await refresh();
    UI.toast('Draft access grant created. No user access was enabled.', 'success', 5000);
  } catch (error) {
    setDialogError(
      'phase3GrantFormError',
      error.message || 'The draft grant could not be created.',
    );
  } finally {
    setButtonBusy('phase3GrantSubmit', false, 'Create draft', 'Creating...');
  }
}

async function submitStateChange(event) {
  event.preventDefault();
  const action = element('phase3StateAction').value;
  const idleText = action === 'revoke' ? 'Revoke permanently' : 'Suspend grant';
  setDialogError('phase3StateError');
  setButtonBusy('phase3StateSubmit', true, idleText, 'Applying...');
  try {
    await changeAccessGrant({
      client: AUTH.getClient(),
      session: await AUTH.getSecuritySession(),
      grantId: element('phase3StateGrantId').value,
      action,
      reason: element('phase3StateReason').value,
      deviceHint: navigator.userAgent,
    });
    closeStateDialog();
    await refresh();
    UI.toast(
      action === 'revoke' ? 'Access grant revoked permanently.' : 'Access grant suspended.',
      'success',
      5000,
    );
  } catch (error) {
    setDialogError(
      'phase3StateError',
      error.message || 'The grant state could not be changed.',
    );
  } finally {
    setButtonBusy('phase3StateSubmit', false, idleText, 'Applying...');
  }
}

function bindEvents() {
  element('phase3Refresh').addEventListener('click', refresh);
  element('phase3CreateGrant').addEventListener('click', openGrantDialog);
  element('phase3GrantForm').addEventListener('submit', submitGrant);
  element('phase3StateForm').addEventListener('submit', submitStateChange);
  document.querySelectorAll('[data-phase3-close]').forEach(button => {
    button.addEventListener('click', closeGrantDialog);
  });
  document.querySelectorAll('[data-phase3-state-close]').forEach(button => {
    button.addEventListener('click', closeStateDialog);
  });
  element('phase3GrantDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeGrantDialog();
  });
  element('phase3StateDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeStateDialog();
  });
  element('phase3GrantFilter').addEventListener('change', event => {
    state.statusFilter = event.target.value;
    renderGrants();
  });
  element('phase3AuditFilter').addEventListener('change', event => {
    state.auditFilter = event.target.value;
    renderAudit();
  });
  element('phase3GrantList').addEventListener('click', event => {
    const button = event.target.closest('[data-phase3-action]');
    if (!button) return;
    const action = button.dataset.phase3Action;
    if (action === 'inspect') {
      UI.toast('Grant details are shown in the row and immutable audit.', 'info', 4000);
      return;
    }
    if (['suspend', 'revoke'].includes(action)) {
      openStateDialog(button.dataset.grantId, action);
    }
  });
}

export async function initializeAccessControlPanel() {
  if (!PHASE3_SECURITY.panelPreviewEnabled) return;
  element('phase3NavItem').hidden = false;
  if (state.initialized) return;
  state.initialized = true;
  bindEvents();
}

export async function openAccessControlPanel() {
  await initializeAccessControlPanel();
  await refresh();
}
