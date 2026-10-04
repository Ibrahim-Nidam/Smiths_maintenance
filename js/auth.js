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
