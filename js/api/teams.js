import { supabase } from '../supabase.js';

export async function listTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*, profiles(id, full_name, role, active)')
    .order('name');
  if (error) throw error;
  return data.map(t => {
    const members = (t.profiles || []).slice().sort((a, b) =>
      String(a.full_name || '').localeCompare(String(b.full_name || ''))
    );
    return {
      ...t,
      members,
      member_count: members.length,
    };
  });
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
