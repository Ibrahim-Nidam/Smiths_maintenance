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
        <label class="label">Assigned Role (Read-only)</label>
        <div>
          <span class="badge badge-accent font-medium text-sm py-1 px-3">
            🛡️ ${esc(ROLE_LABELS[profile.role] || profile.role)}
          </span>
        </div>
      </div>
      <div class="field">
        <label class="label" for="profile-name">Full Name *</label>
        <input class="input" id="profile-name" name="fullName" required value="${esc(profile.full_name || '')}">
      </div>
      <div class="field">
        <label class="label" for="profile-email">Email Address *</label>
        <input class="input" id="profile-email" name="email" type="email" required value="${esc(currentEmail)}">
      </div>
      <hr class="my-4 border-gray-200">
      <h4 class="font-semibold text-sm mb-2 text-gray-900">Change Password</h4>
      <p class="text-xs text-gray-500 mb-3">Leave password fields empty if you do not wish to change your password.</p>
      <div class="field">
        <label class="label" for="profile-pass">New Password</label>
        <input class="input" id="profile-pass" name="password" type="password" minlength="6" placeholder="Min 6 characters">
      </div>
      <div class="field">
        <label class="label" for="profile-pass-confirm">Confirm New Password</label>
        <input class="input" id="profile-pass-confirm" name="confirmPassword" type="password" minlength="6" placeholder="Re-enter new password">
      </div>
      <p class="error-text"></p>
    `,
    submitText: 'Save Profile Changes',
    onSubmit: async (form, close) => {
      const fullName = form.fullName.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;

      if (!fullName) throw new Error('Full Name is required.');
      if (!email) throw new Error('Email Address is required.');

      if (password || confirmPassword) {
        if (password !== confirmPassword) {
          throw new Error('New passwords do not match. Please re-enter.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
      }

      await updateSelfProfile({ fullName, email, password });
      
      // Update local profile object
      profile.full_name = fullName;

      toast('Profile updated successfully.');
      if (onUpdateSuccess) onUpdateSuccess(profile);
      close();
    }
  });
}
