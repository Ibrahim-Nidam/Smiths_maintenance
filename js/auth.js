import { supabase } from './supabase.js';

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'maintenance_manager',
  TEAM_LEAD: 'team_lead',
  TECHNICIAN: 'technician',
};

// Signs in with an email address or with the full name of the account.
// A value without "@" is resolved to the sign-in address by the
// resolve_login_email function (sql/012_login_and_accounts.sql).
export async function signIn(identifier, password) {
  const value = String(identifier || '').trim();
  if (!value) throw new Error('Enter your email address or full name.');

  let email = value;
  if (!value.includes('@')) {
    const { data, error } = await supabase.rpc('resolve_login_email', { p_identifier: value });
    if (error) {
      throw new Error('Signing in with a full name is not available yet. Run sql/012_login_and_accounts.sql in the Supabase SQL editor, or sign in with your email address.');
    }
    if (!data) throw new Error('No account matches that full name.');
    email = data;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials'
        ? 'Email or full name and password do not match.'
        : error.message
    );
  }
}

// True when an RPC is missing because migration 012 has not been run yet.
function isMissingFunction(error) {
  const message = String(error?.message || '');
  return error?.code === '42883' || error?.code === 'PGRST202' || /could not find the function|does not exist/i.test(message);
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('index.html');
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

  const newEmail = email ? email.trim() : '';
  if (newEmail && newEmail.toLowerCase() !== String(session.user.email || '').toLowerCase()) {
    try {
      // Preferred path: change the address immediately (sql/012_login_and_accounts.sql).
      const { error: rpcErr } = await supabase.rpc('update_user_email', {
        p_user_id: session.user.id,
        p_new_email: newEmail,
      });
      if (rpcErr) throw rpcErr;
      // The address changed on the server: refresh the session so the app shows it.
      await supabase.auth.refreshSession();
    } catch (rpcErr) {
      if (!isMissingFunction(rpcErr)) throw rpcErr;
      // Fallback while migration 012 is not applied: Supabase may send a confirmation link.
      const { error: authErr } = await supabase.auth.updateUser({ email: newEmail });
      if (authErr) throw authErr;
    }
  }

  if (password && password.trim()) {
    if (password.trim().length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }
    const { error: authErr } = await supabase.auth.updateUser({ password: password.trim() });
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
    sessionStorage.setItem(
      'smiths_auth_message',
      profile ? 'Your account has been deactivated. Contact an administrator.' : 'Your account profile could not be found.'
    );
    await supabase.auth.signOut();
    window.location.replace('index.html');
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) return null;
  return profile;
}
