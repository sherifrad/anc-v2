import { createSupabaseContext } from 'npm:@supabase/server';

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

    return Response.json(
      { expiredCount: Number(expiredCount || 0) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  },
};
