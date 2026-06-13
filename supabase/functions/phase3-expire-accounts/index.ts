import { createSupabaseContext } from 'npm:@supabase/server';

const OWNER_ID = 'bfcaa90e-c49c-4a94-8cfd-06a16a96a094';
const LONG_BAN_DURATION = '876000h';

export default {
  fetch: async (req: Request) => {
    if (req.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: context, error: contextError } = await createSupabaseContext(
      req,
      { auth: 'secret' },
    );
    if (contextError || !context) {
      return Response.json(
        { error: 'Server authorization required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: expiredCount, error } = await context.supabaseAdmin.rpc(
      'phase3_expire_due_accounts',
    );
    if (error) {
      return Response.json(
        { error: 'Expiry processing failed.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data: pendingAccounts, error: pendingError } =
      await context.supabaseAdmin.rpc('phase3_accounts_requiring_containment');
    if (pendingError) {
      return Response.json(
        {
          error: 'Expiry was recorded, but Auth containment discovery failed.',
          expiredCount: Number(expiredCount || 0),
        },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let containedCount = 0;
    let containmentFailures = 0;
    for (const account of pendingAccounts || []) {
      const { error: banError } =
        await context.supabaseAdmin.auth.admin.updateUserById(account.user_id, {
          ban_duration: LONG_BAN_DURATION,
        });
      const { error: auditError } = await context.supabaseAdmin.rpc(
        'phase3_record_auth_containment',
        {
          p_actor_user_id: OWNER_ID,
          p_target_user_id: account.user_id,
          p_grant_id: account.grant_id,
          p_reason: `scheduled_${account.grant_status}`,
          p_outcome: banError ? 'failed' : 'success',
          p_failure_code: banError?.code || null,
        },
      );
      if (banError || auditError) {
        containmentFailures += 1;
      } else {
        containedCount += 1;
      }
    }

    return Response.json(
      {
        expiredCount: Number(expiredCount || 0),
        containedCount,
        containmentFailures,
      },
      {
        status: containmentFailures ? 207 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  },
};
