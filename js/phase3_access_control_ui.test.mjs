import fs from 'node:fs/promises';

const html = await fs.readFile(
  new URL('../index.html', import.meta.url),
  'utf8',
);
const css = await fs.readFile(
  new URL('../css/style.css', import.meta.url),
  'utf8',
);
const app = await fs.readFile(
  new URL('./app.js', import.meta.url),
  'utf8',
);
const auth = await fs.readFile(
  new URL('./auth.js', import.meta.url),
  'utf8',
);
const access = await fs.readFile(
  new URL('./phase3_access_control.mjs', import.meta.url),
  'utf8',
);
const ui = await fs.readFile(
  new URL('./phase3_access_control_ui.mjs', import.meta.url),
  'utf8',
);
const worker = await fs.readFile(
  new URL('../service-worker.js', import.meta.url),
  'utf8',
);

for (const id of [
  'phase3NavItem',
  'view-access',
  'phase3Refresh',
  'phase3CreateGrant',
  'phase3GrantFilter',
  'phase3GrantList',
  'phase3AuditFilter',
  'phase3AuditBody',
  'phase3MutationState',
  'phase3DelegatedState',
  'phase3GrantDialog',
  'phase3GrantForm',
  'phase3DisplayName',
  'phase3CredentialResult',
  'phase3GeneratedUsername',
  'phase3GeneratedPassword',
  'phase3GrantTotp',
  'phase3GrantTotpCode',
  'phase3GrantTotpConfirm',
  'phase3StateDialog',
  'phase3StateForm',
]) {
  if (!html.includes(`id="${id}"`)) {
    throw new Error(`Access-control UI is missing #${id}`);
  }
}

for (const fragment of [
  '.phase3-metrics',
  '.phase3-lower-grid',
  '.phase3-grant-row',
  '.phase3-audit-table',
  '@media(max-width:600px)',
  '.phase3-audit-table td::before',
  '.phase3-dialog-overlay',
  '.phase3-permission-fieldset',
]) {
  if (!css.includes(fragment)) {
    throw new Error(`Access-control responsive styling is missing: ${fragment}`);
  }
}

for (const fragment of [
  "import('./phase3_access_control_ui.mjs?v=24')",
  "access:'Owner Access Control'",
  'module.openAccessControlPanel()',
]) {
  if (!app.includes(fragment)) {
    throw new Error(`App integration is missing: ${fragment}`);
  }
}

for (const fragment of [
  'getSecuritySession',
  'await assertOwner(session)',
  "aal: aal.data.currentLevel",
  'requireFreshTotp',
  'verifyFreshTotpCode',
  "mfaPurpose = 'step_up'",
]) {
  if (!auth.includes(fragment)) {
    throw new Error(`Owner session protection is missing: ${fragment}`);
  }
}

for (const fragment of [
  'showInlineTotp()',
  "AUTH.verifyFreshTotpCode(element('phase3GrantTotpCode').value)",
  "element('phase3GrantCloseTop').hidden = true",
  "element('phase3GrantCloseBottom').textContent = 'I saved these credentials'",
  "element('phase3CredentialResult').hidden",
]) {
  if (!ui.includes(fragment)) {
    throw new Error(`One-time credential protection is missing: ${fragment}`);
  }
}

for (const forbidden of [
  '.insert(',
  '.update(',
  '.delete(',
  '.upsert(',
  'service_role',
]) {
  if (access.includes(forbidden) || ui.includes(forbidden)) {
    throw new Error(`Disabled panel contains forbidden mutation path: ${forbidden}`);
  }
}

for (const rpc of [
  "client.rpc(name, params)",
  "'phase3_create_draft_grant'",
  "'phase3_change_grant_state'",
  "'phase3-provision-user'",
]) {
  if (!access.includes(rpc)) {
    throw new Error(`Protected owner RPC integration is missing: ${rpc}`);
  }
}

for (const forbiddenLabel of [
  'Existing Supabase user ID',
  'phase3GranteeId',
]) {
  if (html.includes(forbiddenLabel) || ui.includes(forbiddenLabel)) {
    throw new Error(`Owner UI still exposes legacy identity input: ${forbiddenLabel}`);
  }
}

const createButton = html.match(
  /<button[^>]*id="phase3CreateGrant"[\s\S]*?<\/button>/
)?.[0] || '';
if (!createButton || /\sdisabled(?:\s|=|>)/.test(createButton)) {
  throw new Error('Released temporary-account button must not be hardcoded disabled');
}

for (const asset of [
  './js/phase3_security_config.mjs?v=2',
  './js/phase3_access_control.mjs?v=3',
  './js/phase3_access_control_ui.mjs?v=24',
]) {
  if (!worker.includes(asset)) {
    throw new Error(`Service worker does not include ${asset}`);
  }
}

console.log(JSON.stringify({
  passed: true,
  checks: [
    'owner access-control navigation and view are present',
    'grant, audit, and release-safeguard states are present',
    'desktop and mobile responsive rules are present',
    'owner and aal2 session information is required',
    'browser mutations are limited to the protected owner RPCs',
    'Phase 3 preview assets are included in the PWA shell',
  ],
}, null, 2));
