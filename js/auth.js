import { supabase } from './supabase.js';

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'maintenance_manager',
  TEAM_LEAD: 'team_lead',
  TECHNICIAN: 'technician',
};

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles').select('id, full_name, role, team_id, active')
    .eq('id', session.user.id).single();
  if (error) throw error;
  return data;
}

export async function updateSelfProfile({ fullName, email, password }) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const authUpdates = {};
  if (email && email.trim() !== session.user.email) {
    authUpdates.email = email.trim();
  }
  if (password && password.trim()) {
    if (password.trim().length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    authUpdates.password = password.trim();
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authErr } = await supabase.auth.updateUser(authUpdates);
    if (authErr) throw authErr;
  }

  if (fullName !== undefined && fullName.trim()) {
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', session.user.id);
    if (profileErr) throw profileErr;
  }
}

// Redirects to login if not signed in, or returns null if the role is not allowed.
// This is only for UX. Real security is enforced by RLS and RPC functions.
export async function requireAuth(allowedRoles = null) {
  const profile = await getProfile().catch(() => null);
  if (!profile || !profile.active) {
    window.location.href = 'index.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) return null;
  return profile;
}

