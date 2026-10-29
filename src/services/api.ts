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
      throw new Error(error?.message || 'Supabase authentication failed. Please check your credentials.');
    }
    this.token = data.session.access_token;
    localStorage.setItem(SESSION_TOKEN_KEY, data.session.access_token);
    // Fetch state with verified token
    const res = await this.fetchState();
    if (!res.viewer) {
      await supabase.auth.signOut().catch(() => {});
      this.setSession(null, null);
      throw new Error(
        `User '${email}' was authenticated by Supabase Auth, but no authorized campus profile was found in the database. Please contact your campus administrator.`
      );
    }
    this.setSession(data.session.access_token, res.viewer.id);
    return { user: res.viewer, state: res.state };
  }

  async signOutWithSupabaseAuth(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    await this.logout();
  }
}

export const api = new ApiService();

