import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { INITIAL_DATABASE_STATE } from '../data/seedData';
import {
  AppDatabaseState,
  BookingRequest,
  ConditionReport,
  IncidentReport,
  PlatformPolicySettings,
  Resource,
  User,
  UserRole,
} from '../types';

const SESSION_TOKEN_KEY = 'rb_session_token_v1';
const SESSION_USER_ID_KEY = 'rb_session_user_id_v1';

class ApiService {
  private token: string | null = localStorage.getItem(SESSION_TOKEN_KEY);

  getToken(): string | null {
    return this.token;
  }

  getSavedUserId(): string | null {
    return localStorage.getItem(SESSION_USER_ID_KEY);
  }

  isSupabaseEnabled(): boolean {
    return isSupabaseConfigured;
  }

  private setSession(token: string | null, userId: string | null) {
    this.token = token;
    if (token && userId) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      localStorage.setItem(SESSION_USER_ID_KEY, userId);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_USER_ID_KEY);
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    // If Supabase has an active session token, prefer it
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch {
        // Fall back to stored session token
      }
    }

    if (!headers['Authorization'] && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }


    const res = await fetch(path, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        this.setSession(null, null);
      }
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data as T;
  }

  async validateSession(): Promise<{ viewer: User | null; state: AppDatabaseState }> {
    if (supabase) {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          this.setSession(null, null);
        } else {
          // Cryptographically verify with Supabase Auth server
          const { error: userError } = await supabase.auth.getUser();
          if (userError) {
            await supabase.auth.signOut().catch(() => {});
            this.setSession(null, null);
          } else {
            this.token = session.access_token;
            localStorage.setItem(SESSION_TOKEN_KEY, session.access_token);
          }
        }
      } catch {
        this.setSession(null, null);
      }
    }
    return this.fetchState();
  }

  async fetchState(): Promise<{ viewer: User | null; state: AppDatabaseState }> {
    const result = await this.request<{ viewer: User | null; state: AppDatabaseState }>('/api/state');
    return result;
  }

  async login(_userIdOrEmail: string): Promise<{ token: string; user: User; state: AppDatabaseState }> {
    throw new Error(
      'Passwordless login is disabled for security. Please sign in using your campus email and password with Supabase Auth.'
    );
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      this.setSession(null, null);
    }
  }

  async resetDemoData(): Promise<{ message: string; state: AppDatabaseState }> {
    return this.request('/api/demo/reset', { method: 'POST' });
  }

  async createBooking(payload: {
    resourceId: string;
    date: string;
    startTime: string;
    durationHours: number;
    purpose: string;
    courseOrProjectCode: string;
    supervisorName: string;
    agreedToSafetyRules: boolean;
    selfDeclaredEligible: boolean;
  }): Promise<{ booking: BookingRequest; state: AppDatabaseState }> {
    return this.request('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async decideBooking(
    bookingId: string,
    decision: 'Approved' | 'Rejected' | 'Waitlisted',
    note?: string
  ): Promise<{ booking: BookingRequest; state: AppDatabaseState }> {
    return this.request(`/api/bookings/${bookingId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
  }

  async cancelBooking(bookingId: string): Promise<{ booking: BookingRequest; state: AppDatabaseState }> {
    return this.request(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
    });
  }

  async checkInBooking(
    bookingId: string,
    payload: {
      rating: ConditionReport['rating'];
      checklistVerified: boolean;
      accessoriesPresent: boolean;
      notes: string;
    }
  ): Promise<{ booking: BookingRequest; state: AppDatabaseState }> {
    return this.request(`/api/bookings/${bookingId}/checkin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async checkOutBooking(
    bookingId: string,
    payload: {
      rating: ConditionReport['rating'];
      checklistVerified: boolean;
      accessoriesPresent: boolean;
      notes: string;
    }
  ): Promise<{ booking: BookingRequest; state: AppDatabaseState }> {
    return this.request(`/api/bookings/${bookingId}/checkout`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createIncident(payload: {
    resourceId: string;
    bookingId?: string;
    category: IncidentReport['category'];
    severity: IncidentReport['severity'];
    description: string;
    supportingImageRef?: string;
  }): Promise<{ incident: IncidentReport; state: AppDatabaseState }> {
    return this.request('/api/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateIncident(
    incidentId: string,
    payload: {
      status?: IncidentReport['status'];
      managerReviewNotes?: string;
      updateResourceStatus?: Resource['status'];
    }
  ): Promise<{ incident: IncidentReport; state: AppDatabaseState }> {
    return this.request(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async createResource(payload: Partial<Resource>): Promise<{ resource: Resource; state: AppDatabaseState }> {
    return this.request('/api/resources', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateResource(
    resourceId: string,
    payload: Partial<Resource>
  ): Promise<{ resource: Resource; state: AppDatabaseState }> {
    return this.request(`/api/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async updateUserRole(
    userId: string,
    payload: { role?: UserRole; activeRestrictions?: string | null }
  ): Promise<{ user: User; state: AppDatabaseState }> {
    return this.request(`/api/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async updatePolicy(
    payload: Partial<PlatformPolicySettings>
  ): Promise<{ policy: PlatformPolicySettings; state: AppDatabaseState }> {
    return this.request('/api/policy', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async signInWithSupabaseAuth(email: string, password: string): Promise<{ user: User; state: AppDatabaseState }> {
    if (!supabase) {
      throw new Error('Supabase client is not configured in this environment.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.session) {
      const msg = error?.message?.toLowerCase() || '';
      if (msg.includes('invalid') || msg.includes('credential')) {
        throw new Error('Invalid email or password. Please verify your credentials and try again.');
      }
      if (msg.includes('email not confirmed')) {
        throw new Error('Your email address has not been verified. Please confirm your email via the link sent to your inbox.');
      }
      throw new Error(error?.message || 'Authentication failed. Please check your credentials.');
    }
    this.token = data.session.access_token;
    localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);

    // Fetch state with verified token
    const res = await this.fetchState();
    if (!res.viewer) {
      await supabase.auth.signOut().catch(() => {});
      this.setSession(null, null);
      throw new Error(
        'User was authenticated by Supabase Auth, but no active campus organisation membership was found. Access is restricted to organisation-authorised members.'
      );
    }

    if (res.viewer.status === 'inactive') {
      await supabase.auth.signOut().catch(() => {});
      this.setSession(null, null);
      throw new Error(
        'Your organisation membership is currently inactive. Please contact your campus administrator for reactivation.'
      );
    }

    if (res.viewer.status === 'invited') {
      await supabase.auth.signOut().catch(() => {});
      this.setSession(null, null);
      throw new Error(
        'Your account invitation is pending password setup. Please use the secure setup link sent to your email.'
      );
    }

    if (res.viewer.emailVerified === false) {
      await supabase.auth.signOut().catch(() => {});
      this.setSession(null, null);
      throw new Error(
        'Your email address has not been verified. Please confirm your email address before signing in.'
      );
    }

    this.setSession(data.session.access_token, res.viewer.id);
    return { user: res.viewer, state: res.state };
  }

  async sendPasswordResetEmail(email: string): Promise<{ success: boolean; message: string }> {
    if (!supabase) {
      throw new Error('Supabase client is not configured in this environment.');
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      throw new Error('Please enter your registered organisation email.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/#type=recovery` : undefined,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('smtp') || msg.includes('provider') || msg.includes('not configured')) {
        throw new Error(
          `Supabase email delivery error: ${error.message}. Please configure SMTP or custom email provider in your Supabase project settings.`
        );
      }
      if (msg.includes('rate limit')) {
        throw new Error('Too many requests. Please wait a few minutes before requesting another reset email.');
      }
      // For general errors that might reveal user existence, return safe message
      console.warn('[Supabase Auth Reset Notice]:', error.message);
    }

    // Safe generic success message preventing account enumeration
    return {
      success: true,
      message: 'If an active organisation account exists for that email, a password reset link has been dispatched. Please check your inbox and spam folder.',
    };
  }

  async updatePassword(newPassword: string): Promise<{ user: User; state: AppDatabaseState }> {
    if (!supabase) {
      throw new Error('Supabase client is not configured in this environment.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to update password. Please try requesting a new reset link.');
    }

    const res = await this.fetchState();
    if (!res.viewer) {
      throw new Error('Password updated, but could not load organisation profile.');
    }
    return { user: res.viewer, state: res.state };
  }

  async inviteMember(payload: {
    email: string;
    name: string;
    role: UserRole;
    department: string;
  }): Promise<{ success: boolean; message: string; member: User; state: AppDatabaseState }> {
    return this.request<{ success: boolean; message: string; member: User; state: AppDatabaseState }>('/api/admin/members/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateMemberStatus(
    userId: string,
    status: 'active' | 'inactive'
  ): Promise<{ success: boolean; message: string; member: User; state: AppDatabaseState }> {
    return this.request<{ success: boolean; message: string; member: User; state: AppDatabaseState }>(`/api/admin/members/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async signOutWithSupabaseAuth(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    await this.logout();
  }
}

export const api = new ApiService();

