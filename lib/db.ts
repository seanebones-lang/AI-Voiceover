import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type StyleOptions = import('../types/emotion').StyleOptions;

export async function upsertVoice(
  name: string,
  embedding: number[],
  samples: string[],
  userId: string,
  description?: string
) {
  const { data, error } = await supabaseAdmin
    .from('voices')
    .upsert({ name, embedding, samples: { urls: samples }, user_id: userId, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function searchVoices(queryEmbedding: number[], limit = 10, userId?: string) {
  const base = supabase.from('voices').select('*').order('embedding', { ascending: true }).limit(limit);
  const query = userId ? base.eq('user_id', userId) : base;
  const { data } = await query;
  return data;
}

export async function getUserStats(userId: string) {
  const { data } = await supabase.from('usage_stats').select('*').eq('user_id', userId).single();
  return data;
}

export async function incrementCredits(userId: string, amount: number) {
  // TODO: use Supabase RPC for atomic increment (e.g. credits + amount). This sets credits to amount.
  return supabaseAdmin.from('users').update({ credits: amount }).eq('id', userId);
}