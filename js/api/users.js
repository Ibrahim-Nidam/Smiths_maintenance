import { supabase } from '../supabase.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, teams(id, name)')
    .order('full_name');
  if (error) throw error;
  return data;
}

async function checkTeamLeadLimit(teamId, userId = null) {
  if (!teamId) return;
  let query = supabase
    .from('profiles')
    .select('id, full_name')
    .eq('team_id', teamId)
    .eq('role', 'team_lead')
    .eq('active', true);

  if (userId) query = query.neq('id', userId);

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) {
    throw new Error(`Team already has a Team Lead (${data[0].full_name}). A team can only have one Team Lead.`);
  }
}

export async function createUser({ email, password, fullName, role, teamId }) {
  if (role === 'team_lead' && teamId) {
    await checkTeamLeadLimit(teamId);
  }

  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await tempClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
        team_id: teamId || null,
      }
    }
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Failed to create user account');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: authData.user.id,
      full_name: fullName.trim(),
      role: role,
      team_id: teamId || null,
      active: true,
    })
    .select('*, teams(id, name)')
    .single();

  if (profileError) {
    console.warn('Profile sync note:', profileError.message);
  }

  return profile || authData.user;
}

export async function updateUser(id, { fullName, role, teamId, active }) {
  if (role === 'team_lead' && teamId && active !== false) {
    await checkTeamLeadLimit(teamId, id);
  }

  const updates = {};
  if (fullName !== undefined) updates.full_name = fullName.trim();
  if (role !== undefined) updates.role = role;
  if (teamId !== undefined) updates.team_id = teamId || null;
  if (active !== undefined) updates.active = active;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('*, teams(id, name)')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteUser(id) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
