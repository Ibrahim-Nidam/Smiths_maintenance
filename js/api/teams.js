import { supabase } from '../supabase.js';

export async function listTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*, profiles(id)')
    .order('name');
  if (error) throw error;
  return data.map(t => ({
    ...t,
    member_count: t.profiles ? t.profiles.length : 0,
  }));
}

export async function createTeam({ name }) {
  const { data, error } = await supabase
    .from('teams')
    .insert([{ name: name.trim() }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTeam(id, { name }) {
  const { data, error } = await supabase
    .from('teams')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTeam(id) {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
