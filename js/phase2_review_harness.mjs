import {
  benchmarkPassphraseKdfDraft,
  createVaultDraft,
  decryptDraftPayload,
  encryptDraftPayload,
  unlockVaultWithPassphrase,
  unlockVaultWithRecoveryKey,
} from './phase2_crypto_draft.mjs';
import {
  formatRecoveryCode,
  parseRecoveryCode,
} from './phase2_recovery_draft.mjs';

const ownerId = '00000000-0000-4000-8000-000000000001';

function setResult(id, value, passed=null) {
  const output = document.getElementById(id);
  output.textContent = value;
  output.className = passed === true ? 'passed' : passed === false ? 'failed' : '';
}

async function withBusy(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Running...';
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.getElementById('runBenchmark').addEventListener('click', event => {
  withBusy(event.currentTarget, async () => {
    try {
      const iterations = Number(document.getElementById('benchmarkIterations').value);
      const result = await benchmarkPassphraseKdfDraft({ iterations, runs: 3 });
      const acceptable = result.maxMs < 1000;
      setResult(
        'benchmarkOutput',
        `Average: ${result.averageMs} ms\nMaximum: ${result.maxMs} ms\nSamples: ${result.samplesMs.join(', ')} ms`,
        acceptable,
      );
    } catch (error) {
      setResult('benchmarkOutput', error.message, false);
    }
  });
});

document.getElementById('runCryptoTest').addEventListener('click', event => {
  withBusy(event.currentTarget, async () => {
    try {
      const passphrase = 'synthetic-review-passphrase';
      const { vault, recoveryKey } = await createVaultDraft({
        ownerId,
        passphrase,
      });
      const context = {
        ownerId,
        table: 'review',
        recordId: 'FAKE-RECORD',
        keyVersion: 1,
      };
      const fakeRecord = { id: 'FAKE-RECORD', value: 'No patient data' };

      const passphraseKey = await unlockVaultWithPassphrase({ vault, passphrase });
      const encrypted = await encryptDraftPayload(passphraseKey, fakeRecord, context);
      const decrypted = await decryptDraftPayload(passphraseKey, encrypted, context);

      const recoveryKeyObject = await unlockVaultWithRecoveryKey({ vault, recoveryKey });
      const recovered = await decryptDraftPayload(recoveryKeyObject, encrypted, context);

      if (JSON.stringify(decrypted) !== JSON.stringify(fakeRecord)
          || JSON.stringify(recovered) !== JSON.stringify(fakeRecord)) {
        throw new Error('Synthetic round trip did not match');
      }

      let wrongPasswordRejected = false;
      try {
        await unlockVaultWithPassphrase({ vault, passphrase: 'wrong-password-value' });
      } catch {
        wrongPasswordRejected = true;
      }
      if (!wrongPasswordRejected) throw new Error('Wrong passphrase was accepted');

      setResult(
        'cryptoOutput',
        'Passed\n- Passphrase unlock\n- Recovery unlock\n- Fake record round trip\n- Wrong passphrase rejection',
        true,
      );
    } catch (error) {
      setResult('cryptoOutput', error.message, false);
    }
  });
});

document.getElementById('generateRecovery').addEventListener('click', event => {
  withBusy(event.currentTarget, async () => {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const raw = btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const formatted = await formatRecoveryCode(raw);
      const parsed = await parseRecoveryCode(formatted);
      if (parsed !== raw) throw new Error('Recovery sample did not round trip');
      setResult('recoveryOutput', formatted, true);
    } catch (error) {
      setResult('recoveryOutput', error.message, false);
    }
  });
});
