import { openModal } from './modal.js';
import { toast } from './toast.js';
import { getSession, updateSelfProfile } from '../auth.js';
import { esc } from './ui.js';

const ROLE_LABELS = {
  admin: 'Admin',
  maintenance_manager: 'Maintenance Manager',
  team_lead: 'Team Lead',
  technician: 'Technician',
};

export async function openProfileModal(profile, onUpdateSuccess = null) {
  const session = await getSession();
  const currentEmail = session?.user?.email || '';

  openModal({
    title: 'My Profile',
    contentHtml: `
      <div class="field">
        <label class="label">Assigned role (read-only)</label>
        <div><span class="badge badge-accent">${esc(ROLE_LABELS[profile.role] || profile.role)}</span></div>
      </div>
      <div class="field">
        <label class="label" for="profile-name">Full name *</label>
        <input class="input" id="profile-name" name="fullName" required value="${esc(profile.full_name || '')}">
      </div>
      <div class="field">
        <label class="label" for="profile-email">Email address *</label>
        <input class="input" id="profile-email" name="email" type="email" required value="${esc(currentEmail)}">
      </div>
      <hr>
      <h4 class="small strong mb-2">Change password</h4>
      <p class="tiny muted mb-3">Leave these fields empty if you do not want to change your password.</p>
      <div class="field">
        <label class="label" for="profile-pass">New password</label>
        <input class="input" id="profile-pass" name="password" type="password" minlength="6" autocomplete="new-password" placeholder="Minimum 6 characters">
      </div>
      <div class="field">
        <label class="label" for="profile-pass-confirm">Confirm new password</label>
        <input class="input" id="profile-pass-confirm" name="confirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Re-enter new password">
      </div>
      <p class="error-text"></p>
    `,
    submitText: 'Save Profile Changes',
    onSubmit: async (form, close) => {
      const fullName = form.fullName.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value.trim();
      const confirmPassword = form.confirmPassword.value.trim();

      if (!fullName) throw new Error('Full Name is required.');
      if (!email) throw new Error('Email Address is required.');

      // Only validate password if user filled out at least one of the password fields
      let passwordToUpdate = null;
      if (password || confirmPassword) {
        if (!password) {
          throw new Error('Please enter your new password.');
        }
        if (!confirmPassword) {
          throw new Error('Please re-enter your new password in the confirmation field.');
        }
        if (password !== confirmPassword) {
          throw new Error('New passwords do not match. Please re-enter.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        passwordToUpdate = password;
      }

      await updateSelfProfile({ fullName, email, password: passwordToUpdate });
      
      // Update local profile object
      profile.full_name = fullName;

      toast('Profile updated successfully.');
      if (onUpdateSuccess) onUpdateSuccess(profile);
      close();
    }
  });
}
