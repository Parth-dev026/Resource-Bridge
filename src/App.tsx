import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Calendar,
  FileWarning,
  History,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  RotateCcw,
  Shield,
  Sliders,
  UserCheck,
  X,
} from 'lucide-react';
import { AuditAndAdminView } from './components/AuditAndAdminView';
import { CatalogueView } from './components/CatalogueView';
import { CheckInOutModal } from './components/CheckInOutModal';
import { IncidentsView } from './components/IncidentsView';
import { LandingView } from './components/LandingView';
import { LoginView } from './components/LoginView';
import { ManagerDashboardView } from './components/ManagerDashboardView';
import { MyBookingsView } from './components/MyBookingsView';
import { ResourceDetailModal } from './components/ResourceDetailModal';
import { StudentDashboardView } from './components/StudentDashboardView';
import { INITIAL_DATABASE_STATE } from './data/seedData';
import { supabase } from './lib/supabaseClient';
import { api } from './services/api';
import {
  AppDatabaseState,
  BookingRequest,
  EquipmentConditionRating,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  PlatformPolicySettings,
  Resource,
  ResourceStatus,
  User,
  UserRole,
} from './types';

export type WorkspaceView =
  | 'login'
  | 'landing'
  | 'student-dashboard'
  | 'catalogue'
  | 'my-bookings'
  | 'manager-dashboard'
  | 'incidents'
  | 'audit';

export function App() {
  const [dbState, setDbState] = useState<AppDatabaseState>(INITIAL_DATABASE_STATE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('login');
  const [prefilledLoginEmail, setPrefilledLoginEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal states
  const [selectedResourceForModal, setSelectedResourceForModal] = useState<Resource | null>(null);
  const [checkInOutTarget, setCheckInOutTarget] = useState<{
    booking: BookingRequest;
    mode: 'checkin' | 'checkout';
  } | null>(null);
  const [incidentPreselectedBooking, setIncidentPreselectedBooking] =
    useState<BookingRequest | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      setLoading(true);
      try {
        const res = await api.validateSession();
        if (!mounted) return;
        setDbState(res.state);
        if (res.viewer) {
          setCurrentUser(res.viewer);
          setActiveView(
            res.viewer.role === 'manager'
              ? 'manager-dashboard'
              : res.viewer.role === 'admin'
              ? 'audit'
              : 'student-dashboard'
          );
        } else {
          setCurrentUser(null);
          setActiveView('login');
        }
      } catch {
        if (mounted) {
          setCurrentUser(null);
          setActiveView('login');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    // Listen to Supabase Auth state changes
    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT' || !session) {
          setCurrentUser(null);
          setActiveView('login');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try {
            const res = await api.fetchState();
            if (!mounted) return;
            if (res.viewer) {
              setCurrentUser(res.viewer);
              setDbState(res.state);
            }
          } catch {
            // Ignore background token refresh errors
          }
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleLoginSuccess = (user: User, state: AppDatabaseState) => {
    setCurrentUser(user);
    setDbState(state);
    setActiveView(
      user.role === 'manager'
        ? 'manager-dashboard'
        : user.role === 'admin'
        ? 'audit'
        : 'student-dashboard'
    );
    showToast(`Signed in successfully as ${user.name} (${user.role.toUpperCase()})`);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await api.signOutWithSupabaseAuth();
    } finally {
      setCurrentUser(null);
      setActiveView('login');
      setLoading(false);
      showToast('You have been signed out successfully.');
    }
  };

  const handleOpenLogin = (prefilledEmail?: string) => {
    if (prefilledEmail) {
      setPrefilledLoginEmail(prefilledEmail);
    }
    setActiveView('login');
  };

  const handleResetDemo = async () => {
    try {
      const res = await api.resetDemoData();
      setDbState(res.state);
      showToast('Demo data reset to clean initial state.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to reset demo data');
    }
  };

  const handleCreateBooking = async (payload: {
    resourceId: string;
    date: string;
    startTime: string;
    durationHours: number;
    purpose: string;
    courseOrProjectCode: string;
    supervisorName: string;
    agreedToSafetyRules: boolean;
    selfDeclaredEligible: boolean;
  }): Promise<BookingRequest> => {
    if (!currentUser) {
      handleOpenLogin();
      throw new Error('Please sign in to submit a booking.');
    }
    const res = await api.createBooking(payload);
    setDbState(res.state);
    setSelectedResourceForModal(null);
    showToast(`Booking request submitted: Reference ${res.booking.id} (Status: ${res.booking.status})`);
    return res.booking;
  };

  const handleDecideBooking = async (
    bookingId: string,
    decision: 'Approved' | 'Rejected' | 'Waitlisted',
    note?: string
  ) => {
    const res = await api.decideBooking(bookingId, decision, note);
    setDbState(res.state);
    showToast(`Booking ${bookingId} has been marked as ${decision}.`);
  };

  const handleCheckInOutSubmit = async (
    bookingId: string,
    mode: 'checkin' | 'checkout',
    payload: {
      rating: EquipmentConditionRating;
      checklistVerified: boolean;
      accessoriesPresent: boolean;
      notes: string;
    }
  ) => {
    const res =
      mode === 'checkin'
        ? await api.checkInBooking(bookingId, payload)
        : await api.checkOutBooking(bookingId, payload);
    setDbState(res.state);
    setCheckInOutTarget(null);
    showToast(
      mode === 'checkin'
        ? 'Check-In completed. Good luck with your lab session!'
        : 'Return Check-Out completed. Thank you for taking care of campus equipment.'
    );
  };

  const handleCreateIncident = async (payload: {
    resourceId: string;
    bookingId?: string;
    category: IncidentCategory;
    severity: IncidentSeverity;
    description: string;
    immediateActionTaken?: string;
  }) => {
    const res = await api.createIncident(payload);
    setDbState(res.state);
    setIncidentPreselectedBooking(null);
    showToast(`Problem report filed: ${res.incident.id}. Lab staff will inspect.`);
  };

  const handleUpdateIncident = async (
    incidentId: string,
    payload: {
      status?: IncidentStatus;
      managerReviewNotes?: string;
      updateResourceStatus?: ResourceStatus;
    }
  ) => {
    const res = await api.updateIncident(incidentId, payload);
    setDbState(res.state);
    showToast(`Incident report ${incidentId} updated.`);
  };

  const handleCreateResource = async (payload: Partial<Resource>) => {
    const res = await api.createResource(payload);
    setDbState(res.state);
    showToast(`New resource registered: ${res.resource.name} (${res.resource.code})`);
  };

  const handleUpdateResource = async (resourceId: string, payload: Partial<Resource>) => {
    const res = await api.updateResource(resourceId, payload);
    setDbState(res.state);
    showToast(`Resource ${res.resource.code} updated.`);
  };

  const handleUpdateUserRole = async (
    userId: string,
    payload: { role?: UserRole; activeRestrictions?: string | null }
  ) => {
    const res = await api.updateUserRole(userId, payload);
    setDbState(res.state);
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(res.user);
    }
    showToast(`Permissions updated for ${res.user.name}.`);
  };

  const handleUpdatePolicy = async (payload: Partial<PlatformPolicySettings>) => {
    const res = await api.updatePolicy(payload);
    setDbState(res.state);
    showToast('Campus sharing policy updated.');
  };

  const handleInviteMember = async (payload: {
    email: string;
    name: string;
    role: UserRole;
    department: string;
  }) => {
    const res = await api.inviteMember(payload);
    const { state: updatedState } = await api.fetchState();
    setDbState(updatedState);
    showToast(res.message);
    return res;
  };

  const handleUpdateMemberStatus = async (userId: string, status: 'active' | 'inactive') => {
    const res = await api.updateMemberStatus(userId, status);
    const { state: updatedState } = await api.fetchState();
    setDbState(updatedState);
    showToast(res.message);
    return res;
  };

  const handleCancelBooking = async (bookingId: string) => {
    const res = await api.cancelBooking(bookingId);
    setDbState(res.state);
    showToast(`Booking ${bookingId} has been cancelled.`);
  };

  // Synchronized modal resource lookup
  const liveSelectedResource = selectedResourceForModal
    ? dbState.resources.find((r) => r.id === selectedResourceForModal.id) || selectedResourceForModal
    : null;

  // Render full-page LoginView when activeView is 'login'
  if (activeView === 'login') {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onViewCatalogue={() => setActiveView('catalogue')}
        onViewAbout={() => setActiveView('landing')}
        initialEmail={prefilledLoginEmail}
      />
    );
  }

  // Render full-page LandingView when activeView is 'landing'
  if (activeView === 'landing') {
    return (
      <LandingView
        resources={dbState.resources}
        currentUser={currentUser}
        onOpenLogin={handleOpenLogin}
        onOpenWorkspace={() =>
          setActiveView(
            currentUser?.role === 'manager'
              ? 'manager-dashboard'
              : currentUser?.role === 'admin'
              ? 'audit'
              : 'student-dashboard'
          )
        }
        onOpenCatalogue={() => setActiveView('catalogue')}
        onSelectResource={(res) => setSelectedResourceForModal(res)}
      />
    );
  }

  // Dynamic counts for sidebar badges
  const myPendingCount = currentUser
    ? dbState.bookings.filter(
        (b) => b.studentId === currentUser.id && (b.status === 'Pending' || b.status === 'Waitlisted')
      ).length
    : 0;

  const pendingManagerCount = dbState.bookings.filter((b) => b.status === 'Pending').length;
  const openIncidentsCount = dbState.incidents.filter((i) => i.status !== 'Resolved').length;

  const navItems: {
    id: WorkspaceView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    requiresAuth?: boolean;
    requiresRole?: UserRole[];
  }[] = [
    {
      id: 'student-dashboard',
      label: 'Student Home',
      icon: LayoutDashboard,
      requiresAuth: true,
    },
    { id: 'catalogue', label: 'Browse Resources', icon: BookOpen },
    {
      id: 'my-bookings',
      label: 'My Bookings',
      icon: Calendar,
      count: myPendingCount,
      requiresAuth: true,
    },
    {
      id: 'manager-dashboard',
      label: 'Manager Review',
      icon: Sliders,
      count: pendingManagerCount,
      requiresAuth: true,
    },
    {
      id: 'incidents',
      label: 'Report a Problem',
      icon: FileWarning,
      count: openIncidentsCount,
      requiresAuth: true,
    },
    {
      id: 'audit',
      label: 'History & Sharing Rules',
      icon: History,
      requiresAuth: true,
    },
  ];

  const viewLabels: Record<WorkspaceView, string> = {
    login: 'Campus Sign In',
    landing: 'Overview',
    'student-dashboard': 'Student Home',
    catalogue: 'Browse Shared Resources',
    'my-bookings': 'My Bookings & Condition Reports',
    'manager-dashboard': 'Manager Review & Equipment Console',
    incidents: 'Report a Problem & Review',
    audit: 'Booking History & Fair Sharing Rules',
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar (260px) */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-200 border-r border-slate-800 shrink-0 justify-between">
        <div>
          <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveView('landing')}
              className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap hover:text-teal-400 transition-colors"
            >
              ResourceBridge
            </button>
          </div>

          <div className="px-4 py-4">
            <div className="px-2 text-xs font-mono text-slate-400 mb-2">MENU</div>
            <nav className="space-y-1" aria-label="Workspace navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.requiresAuth && !currentUser) {
                        handleOpenLogin();
                      } else {
                        setActiveView(item.id);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-teal-700 text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count !== undefined && item.count > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums ml-2 px-1.5 py-0.5 rounded ${
                          active ? 'bg-teal-800 text-teal-100' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* User Card & Logout / Platform Intro */}
        <div className="p-4 border-t border-slate-800 space-y-3 text-xs">
          {currentUser ? (
            <div className="p-3 rounded-lg bg-slate-800/90 text-slate-300 space-y-2 border border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">AUTHENTICATED</span>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-800 text-teal-200">
                  {currentUser.role}
                </span>
              </div>
              <div className="font-semibold text-white truncate">{currentUser.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{currentUser.email}</div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded text-xs transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenLogin()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-xs font-semibold shadow transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to Campus</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveView('landing')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Platform Introduction</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-xs bg-slate-900 text-slate-200 h-full flex flex-col justify-between p-4 z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <span className="text-base font-bold text-white font-display">ResourceBridge</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.requiresAuth && !currentUser) {
                          handleOpenLogin();
                        } else {
                          setActiveView(item.id);
                        }
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium ${
                        active
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.count !== undefined && item.count > 0 && (
                        <span className="font-mono text-xs">{item.count}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-rose-900/60 text-rose-200 rounded text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out ({currentUser.name})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleOpenLogin();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-700 text-white rounded text-xs font-semibold"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveView('landing');
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
              >
                <Home className="w-4 h-4" />
                <span>Platform Introduction</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md border border-slate-200"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-500 flex items-center gap-2 truncate">
              <button
                type="button"
                onClick={() => setActiveView('landing')}
                className="hover:text-slate-900 font-medium hidden sm:inline"
              >
                ResourceBridge
              </button>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {viewLabels[activeView]}
              </span>
            </div>
          </div>

          {/* Right Zone: User Identity & Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800">
                  <UserCheck className="w-4 h-4 text-teal-700 shrink-0" />
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-slate-900 truncate">{currentUser.name}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                      {currentUser.role}
                    </span>
                  </div>
                </div>

                {currentUser.role === 'admin' && (
                  <button
                    type="button"
                    onClick={handleResetDemo}
                    title="Reset demonstration data to initial state"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reset Demo</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out of campus workspace"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 whitespace-nowrap shrink-0 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenLogin()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-800 rounded-md hover:bg-teal-900 shadow-sm transition-colors shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Toast */}
        {toastMessage && (
          <div className="bg-slate-900 text-white px-6 py-2.5 text-xs font-medium flex items-center justify-between">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-slate-300 hover:text-white underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Viewport Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
          {loading ? (
            <div className="space-y-4 py-8">
              <div className="h-20 bg-slate-200/70 rounded-lg animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="h-64 bg-slate-200/70 rounded-lg animate-pulse" />
                <div className="h-64 bg-slate-200/70 rounded-lg animate-pulse" />
                <div className="h-64 bg-slate-200/70 rounded-lg animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              {activeView === 'student-dashboard' &&
                (currentUser ? (
                  <StudentDashboardView
                    user={currentUser}
                    resources={dbState.resources}
                    bookings={dbState.bookings}
                    auditEvents={dbState.auditEvents}
                    policy={dbState.policy}
                    onNavigate={(v) => setActiveView(v as WorkspaceView)}
                    onSelectResource={(res) => setSelectedResourceForModal(res)}
                    onOpenCheckInOut={(booking, mode) =>
                      setCheckInOutTarget({ booking, mode })
                    }
                  />
                ) : (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">Sign In Required</h3>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Please sign in with your campus account to view your student dashboard and active bookings.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenLogin()}
                      className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-md hover:bg-teal-900 shadow-sm"
                    >
                      Sign In Now
                    </button>
                  </div>
                ))}

              {activeView === 'catalogue' && (
                <CatalogueView
                  resources={dbState.resources}
                  bookings={dbState.bookings}
                  onSelectResource={(res) => setSelectedResourceForModal(res)}
                />
              )}

              {activeView === 'my-bookings' &&
                (currentUser ? (
                  <MyBookingsView
                    bookings={dbState.bookings}
                    currentUserId={currentUser.id}
                    onCancelBooking={handleCancelBooking}
                    onOpenCheckInOut={(booking, mode) =>
                      setCheckInOutTarget({ booking, mode })
                    }
                    onOpenReportIncidentForBooking={(booking) => {
                      setIncidentPreselectedBooking(booking);
                      setActiveView('incidents');
                    }}
                    onBrowseCatalogue={() => setActiveView('catalogue')}
                  />
                ) : (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">Sign In Required</h3>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Please sign in to view your bookings and return condition reports.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenLogin()}
                      className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-md hover:bg-teal-900 shadow-sm"
                    >
                      Sign In Now
                    </button>
                  </div>
                ))}

              {activeView === 'manager-dashboard' &&
                (currentUser ? (
                  <>
                    {currentUser.role !== 'manager' && currentUser.role !== 'admin' && (
                      <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
                        <div>
                          <strong>Manager Role Required:</strong> You are currently signed in as{' '}
                          <strong>{currentUser.name}</strong> ({currentUser.role}). Approving or
                          rejecting requests requires teacher or lab manager permissions.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleSignOut();
                            handleOpenLogin('p.sharma@school-demo.edu');
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap shrink-0"
                        >
                          Sign In with Manager Account
                        </button>
                      </div>
                    )}
                    <ManagerDashboardView
                      user={currentUser}
                      resources={dbState.resources}
                      bookings={dbState.bookings}
                      incidents={dbState.incidents}
                      auditEvents={dbState.auditEvents}
                      onDecideBooking={handleDecideBooking}
                      onCreateResource={handleCreateResource}
                      onUpdateResource={handleUpdateResource}
                      onNavigate={(v) => setActiveView(v as WorkspaceView)}
                    />
                  </>
                ) : (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">Teacher / Manager Sign In Required</h3>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Please sign in with a manager or teacher account to approve booking requests and inspect equipment.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenLogin('p.sharma@school-demo.edu')}
                      className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-md hover:bg-teal-900 shadow-sm"
                    >
                      Sign In as Manager
                    </button>
                  </div>
                ))}

              {activeView === 'incidents' &&
                (currentUser ? (
                  <IncidentsView
                    user={currentUser}
                    resources={dbState.resources}
                    bookings={dbState.bookings}
                    incidents={dbState.incidents}
                    preselectedBooking={incidentPreselectedBooking}
                    onClearPreselectedBooking={() => setIncidentPreselectedBooking(null)}
                    onCreateIncident={handleCreateIncident}
                    onUpdateIncident={handleUpdateIncident}
                  />
                ) : (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">Sign In Required</h3>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Please sign in to file an equipment condition incident or view pending maintenance reports.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenLogin()}
                      className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-md hover:bg-teal-900 shadow-sm"
                    >
                      Sign In Now
                    </button>
                  </div>
                ))}

              {activeView === 'audit' &&
                (currentUser ? (
                  <AuditAndAdminView
                    currentUser={currentUser}
                    users={dbState.users}
                    resources={dbState.resources}
                    bookings={dbState.bookings}
                    incidents={dbState.incidents}
                    auditEvents={dbState.auditEvents}
                    policy={dbState.policy}
                    onUpdateUserRole={handleUpdateUserRole}
                    onUpdatePolicy={handleUpdatePolicy}
                    onInviteMember={handleInviteMember}
                    onUpdateMemberStatus={handleUpdateMemberStatus}
                  />
                ) : (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">Administrator Sign In Required</h3>
                    <p className="text-xs text-slate-600 max-w-sm mx-auto">
                      Campus sharing rules, compliance logs, and role management require administrator privileges.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenLogin('ananya.deshmukh@school-demo.edu')}
                      className="px-4 py-2 bg-teal-800 text-white text-xs font-semibold rounded-md hover:bg-teal-900 shadow-sm"
                    >
                      Sign In as Administrator
                    </button>
                  </div>
                ))}
            </>
          )}
        </main>
      </div>

      {/* Resource Detail & Booking Modal */}
      {liveSelectedResource && (
        <ResourceDetailModal
          resource={liveSelectedResource}
          bookings={dbState.bookings}
          currentUser={currentUser}
          onClose={() => setSelectedResourceForModal(null)}
          onRequireSignIn={() => {
            setSelectedResourceForModal(null);
            handleOpenLogin();
          }}
          onSubmitBooking={handleCreateBooking}
          onNavigateToMyBookings={() => setActiveView('my-bookings')}
        />
      )}

      {/* Check-In / Check-Out Condition Modal */}
      {checkInOutTarget && (
        <CheckInOutModal
          booking={checkInOutTarget.booking}
          resource={dbState.resources.find(
            (r) => r.id === checkInOutTarget.booking.resourceId
          )}
          mode={checkInOutTarget.mode}
          onClose={() => setCheckInOutTarget(null)}
          onSubmit={handleCheckInOutSubmit}
        />
      )}
    </div>
  );
}

export default App;
