import { supabase } from '../supabase.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getProfile } from '../auth.js';

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

  if (userId) {
    query = query.neq('id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) {
    throw new Error(`Team already has an active Team Lead (${data[0].full_name}). Each team can only have one Team Lead.`);
  }
}

// Sign-in address of every account, keyed by profile id.
// Requires sql/012_login_and_accounts.sql; returns {} while it is missing, so the
// Staff page simply shows no email instead of failing.
export async function listAccountEmails() {
  const { data, error } = await supabase.rpc('list_account_emails');
  if (error) return {};
  const byUser = {};
  (data || []).forEach(row => { byUser[row.user_id] = row.email || ''; });
  return byUser;
}

export async function updateUserEmail(userId, email) {
  const { error } = await supabase.rpc('update_user_email', {
    p_user_id: userId,
    p_new_email: email,
  });
  if (error) {
    const message = String(error.message || '');
    throw new Error(
      /could not find the function|does not exist/i.test(message)
        ? 'Changing an email address needs sql/012_login_and_accounts.sql to be run in the Supabase SQL editor.'
        : message
    );
  }
}

export async function resetUserPassword(userId, newPassword = 'Smiths2026!') {
  const { error } = await supabase.rpc('reset_user_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  });
  if (error) {
    console.error('RPC reset_user_password error:', error);
    throw new Error(error.message || 'Could not reset user password. Make sure 006_updates.sql script was executed in Supabase SQL editor.');
  }
  return true;
}

export async function checkMaintenanceManagerLimit(userIdToChange = null, targetRole = null, callerRole = null) {
  // Admins are exempt from MM minimum limit checks
  if (callerRole === 'admin') return;

  if (targetRole && targetRole === 'maintenance_manager') return; // Upgrading to MM is always allowed
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('role', 'maintenance_manager')
    .eq('active', true);

  if (error) throw error;
  
  const remainingMMs = (data || []).filter(u => u.id !== userIdToChange);
  if (remainingMMs.length === 0) {
    throw new Error('Cannot change or downgrade role. The system requires at least one active Maintenance Manager.');
  }
}

export async function createUser({ email, password = 'Smiths2026!', fullName, role, teamId }) {
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

  if (authError) {
    if (authError.message?.toLowerCase().includes('already registered') || authError.status === 400) {
      throw new Error(`A user account with email "${email}" already exists.`);
    }
    throw authError;
  }
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

export async function updateUser(id, { fullName, role, teamId, active }, callerRole = null) {
  if (!callerRole) {
    const caller = await getProfile().catch(() => null);
    if (caller) callerRole = caller.role;
  }

  if (role === 'team_lead' && teamId && active !== false) {
    await checkTeamLeadLimit(teamId, id);
  }

  // Only enforce MM minimum limit check if caller is NOT an Admin
  if (callerRole !== 'admin') {
    if (role !== undefined || active === false) {
      const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', id).single();
      if (currentProfile && currentProfile.role === 'maintenance_manager') {
        if ((role && role !== 'maintenance_manager') || active === false) {
          await checkMaintenanceManagerLimit(id, role, callerRole);
        }
      }
    }
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

export async function deleteUser(id, callerRole = null) {
  if (!callerRole) {
    const caller = await getProfile().catch(() => null);
    if (caller) callerRole = caller.role;
  }

  // Only enforce MM minimum limit check if caller is NOT an Admin
  if (callerRole !== 'admin') {
    const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single();
    if (target && target.role === 'maintenance_manager') {
      await checkMaintenanceManagerLimit(id, null, callerRole);
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
    .select();

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('User delete failed. Please run section 8 of 006_updates.sql in Supabase SQL editor to grant profile delete permissions.');
  }
}
