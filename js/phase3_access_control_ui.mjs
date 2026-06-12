import { PHASE3_SECURITY } from './phase3_security_config.mjs';
import {
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

function showBlockedAction() {
  UI.toast(
    'Temporary-user changes remain disabled while the delegated-key flow is under review.',
    'warning',
    6000,
  );
}

function bindEvents() {
  element('phase3Refresh').addEventListener('click', refresh);
  element('phase3CreateGrant').addEventListener('click', async () => {
    try {
      await createAccessGrant();
    } catch {
      showBlockedAction();
    }
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
    if (!event.target.closest('[data-phase3-action="inspect"]')) return;
    UI.toast('Grant details are read-only in this safety preview.', 'info', 4000);
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
