import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: caller } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'admin') throw new Error('Admin role required')

    const { email, role = 'viewer' } = await req.json()
    if (!email) throw new Error('Email is required')
    if (!['viewer','editor','admin'].includes(role)) throw new Error('Invalid role')

    const admin = createClient(url, service)
    const redirectTo = req.headers.get('origin') || undefined
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (error) throw error

    if (data.user?.id) {
      await admin.from('profiles').update({ role, email }).eq('id', data.user.id)
    }

    return new Response(JSON.stringify({ ok: true, user_id: data.user?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})
