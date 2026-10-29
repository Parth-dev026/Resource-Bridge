import React, { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Calendar,
  FileWarning,
  History,
  Home,
  LayoutDashboard,
  Menu,
  RotateCcw,
  Sliders,
  UserCheck,
  X,
} from 'lucide-react';
import { AuditAndAdminView } from './components/AuditAndAdminView';
import { CatalogueView } from './components/CatalogueView';
import { CheckInOutModal } from './components/CheckInOutModal';
import { IncidentsView } from './components/IncidentsView';
import { LandingView } from './components/LandingView';
import { ManagerDashboardView } from './components/ManagerDashboardView';
import { MyBookingsView } from './components/MyBookingsView';
import { ResourceDetailModal } from './components/ResourceDetailModal';
import { StudentDashboardView } from './components/StudentDashboardView';
import { INITIAL_DATABASE_STATE } from './data/seedData';
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
  | 'landing'
  | 'student-dashboard'
  | 'catalogue'
  | 'my-bookings'
  | 'manager-dashboard'
  | 'incidents'
  | 'audit';

const DEMO_ACCOUNTS: { id: string; label: string; role: UserRole }[] = [
  { id: 'usr-stu-1', label: 'Aarav Mehta (Student — Tech Club)', role: 'student' },
  { id: 'usr-stu-2', label: 'Diya Krishnan (Senior Student)', role: 'student' },
  { id: 'usr-mgr-1', label: 'Mrs. Priya Sharma (Teacher & Lab Manager)', role: 'manager' },
  { id: 'usr-adm-1', label: 'Dr. Ananya Deshmukh (Principal & Administrator)', role: 'admin' },
];

export function App() {
  const [dbState, setDbState] = useState<AppDatabaseState>(INITIAL_DATABASE_STATE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('landing');
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
    async function init() {
      setLoading(true);
      try {
        const res = await api.fetchState();
        if (!mounted) return;
        setDbState(res.state);
        if (res.viewer) {
          setCurrentUser(res.viewer);
        } else {
          // Authenticate default Student demo profile so workspace actions work out of the box
          const loginRes = await api.login('usr-stu-1');
          if (!mounted) return;
          setCurrentUser(loginRes.user);
          setDbState(loginRes.state);
        }
      } catch {
        // Fallback
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
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

  const handleLoginAs = async (userId: string, targetView?: string) => {
    const res = await api.login(userId);
    setCurrentUser(res.user);
    setDbState(res.state);
    if (targetView) {
      setActiveView(targetView as WorkspaceView);
    } else if (activeView === 'landing') {
      setActiveView(
        res.user.role === 'manager'
          ? 'manager-dashboard'
          : res.user.role === 'admin'
          ? 'audit'
          : 'student-dashboard'
      );
    }
    showToast(`Signed in as ${res.user.name} (${res.user.role.toUpperCase()})`);
  };

  const handleResetDemo = async () => {
    const res = await api.resetDemoData();
    setDbState(res.state);
    showToast('Demo data reset to clean initial state.');
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
    const res = await api.createBooking(payload);
    setDbState(res.state);
    showToast(`Booking request ${res.booking.id} submitted for teacher/manager approval.`);
    return res.booking;
  };

  const handleDecideBooking = async (
    bookingId: string,
    decision: 'Approved' | 'Rejected' | 'Waitlisted',
    note?: string
  ) => {
    const res = await api.decideBooking(bookingId, decision, note);
    setDbState(res.state);
    const friendly = decision === 'Approved' ? 'Approved' : decision === 'Waitlisted' ? 'Waitlisted' : 'Not Approved';
    showToast(`Booking ${bookingId} marked as ${friendly}.`);
  };

  const handleCancelBooking = async (bookingId: string) => {
    const res = await api.cancelBooking(bookingId);
    setDbState(res.state);
    showToast(`Booking ${bookingId} has been cancelled.`);
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
    showToast(
      mode === 'checkin'
        ? `Checked in to ${res.booking.resourceCode}. Pre-use condition recorded!`
        : `Checked out of ${res.booking.resourceCode}. Return condition recorded!`
    );
  };

  const handleCreateIncident = async (payload: {
    resourceId: string;
    bookingId?: string;
    category: IncidentCategory;
    severity: IncidentSeverity;
    description: string;
    supportingImageRef?: string;
  }) => {
    const res = await api.createIncident(payload);
    setDbState(res.state);
    showToast(`Problem report ${res.incident.id} submitted for teacher/manager review.`);
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
    showToast(`Problem report ${res.incident.id} status updated to ${res.incident.status}.`);
  };

  const handleCreateResource = async (payload: Partial<Resource>) => {
    const res = await api.createResource(payload);
    setDbState(res.state);
    showToast(`Resource ${res.resource.code} added to catalogue.`);
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
  };

  const handleUpdatePolicy = async (payload: Partial<PlatformPolicySettings>) => {
    const res = await api.updatePolicy(payload);
    setDbState(res.state);
  };

  const liveSelectedResource = selectedResourceForModal
    ? dbState.resources.find((r) => r.id === selectedResourceForModal.id) ||
      selectedResourceForModal
    : null;

  if (activeView === 'landing') {
    return (
      <>
        <LandingView
          resources={dbState.resources}
          currentUser={currentUser}
          onLoginAs={handleLoginAs}
          onOpenCatalogue={() => setActiveView('catalogue')}
          onSelectResource={(res) => setSelectedResourceForModal(res)}
        />
        {liveSelectedResource && (
          <ResourceDetailModal
            resource={liveSelectedResource}
            bookings={dbState.bookings}
            currentUser={currentUser}
            onClose={() => setSelectedResourceForModal(null)}
            onRequireSignIn={() => handleLoginAs('usr-stu-1', 'catalogue')}
            onSubmitBooking={handleCreateBooking}
            onNavigateToMyBookings={() => setActiveView('my-bookings')}
          />
        )}
      </>
    );
  }

  const pendingManagerCount = dbState.bookings.filter((b) => b.status === 'Pending').length;
  const myBookingsCount = currentUser
    ? dbState.bookings.filter((b) => b.studentId === currentUser.id).length
    : 0;
  const openIncidentsCount = dbState.incidents.filter(
    (i) => i.status === 'Reported' || i.status === 'Under Review'
  ).length;

  const navItems: {
    id: WorkspaceView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'student-dashboard', label: 'Student Home', icon: LayoutDashboard },
    { id: 'catalogue', label: 'Browse Resources', icon: BookOpen, count: dbState.resources.length },
    { id: 'my-bookings', label: 'My Bookings', icon: Calendar, count: myBookingsCount },
    {
      id: 'manager-dashboard',
      label: 'Manager Review',
      icon: Sliders,
      count: pendingManagerCount,
    },
    { id: 'incidents', label: 'Report a Problem', icon: FileWarning, count: openIncidentsCount },
    { id: 'audit', label: 'History & Sharing Rules', icon: History },
  ];

  const viewLabels: Record<WorkspaceView, string> = {
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
              className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap"
            >
              ResourceBridge
            </button>
          </div>

          <div className="px-4 py-4">
            <div className="px-2 text-xs font-mono text-slate-400 mb-2">
              MENU
            </div>
            <nav className="space-y-1" aria-label="Workspace navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
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
                    {item.count !== undefined && (
                      <span
                        className={`font-mono text-xs tabular-nums ml-2 ${
                          active ? 'text-teal-100' : 'text-slate-400'
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

        {/* Bottom Environment Link */}
        <div className="p-4 border-t border-slate-800 space-y-3 text-xs">
          <div className="p-3 rounded-md bg-slate-800/90 text-slate-300 space-y-1">
            <div className="font-mono text-teal-400 font-semibold">
              SCHOOL SHARING SYSTEM
            </div>
            <p className="text-slate-400 leading-relaxed">
              Greenwood College &amp; School resource sharing demo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('landing')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <Home className="w-4 h-4" />
            Platform Introduction
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
                        setActiveView(item.id);
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
                      {item.count !== undefined && (
                        <span className="font-mono text-xs">{item.count}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveView('landing');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              <Home className="w-4 h-4" />
              Platform Introduction
            </button>
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

          {/* Right Zone: Account Switcher & Demo Reset */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-700 hidden sm:inline shrink-0" />
              <label htmlFor="account-switcher" className="sr-only">
                Switch demo user
              </label>
              <select
                id="account-switcher"
                value={currentUser?.id || 'usr-stu-1'}
                onChange={(e) => handleLoginAs(e.target.value)}
                className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {DEMO_ACCOUNTS.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleResetDemo}
              title="Reset demonstration data to initial state"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
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
              {activeView === 'student-dashboard' && currentUser && (
                <StudentDashboardView
                  user={currentUser}
                  resources={dbState.resources}
                  bookings={dbState.bookings}
                  auditEvents={dbState.auditEvents}
                  policy={dbState.policy}
                  onNavigate={(v) => setActiveView(v)}
                  onSelectResource={(res) => setSelectedResourceForModal(res)}
                  onOpenCheckInOut={(booking, mode) =>
                    setCheckInOutTarget({ booking, mode })
                  }
                />
              )}

              {activeView === 'catalogue' && (
                <CatalogueView
                  resources={dbState.resources}
                  bookings={dbState.bookings}
                  onSelectResource={(res) => setSelectedResourceForModal(res)}
                />
              )}

              {activeView === 'my-bookings' && currentUser && (
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
              )}

              {activeView === 'manager-dashboard' && currentUser && (
                <>
                  {currentUser.role !== 'manager' && currentUser.role !== 'admin' && (
                    <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
                      <div>
                        <strong>Manager Role Required:</strong> You are currently signed in as{' '}
                        <strong>{currentUser.name}</strong> (Student). Approving or rejecting requests requires teacher or manager permissions.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoginAs('usr-mgr-1', 'manager-dashboard')}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap shrink-0"
                      >
                        Switch to Mrs. Priya Sharma (Manager)
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
                    onNavigate={(v) => setActiveView(v)}
                  />
                </>
              )}

              {activeView === 'incidents' && currentUser && (
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
              )}

              {activeView === 'audit' && currentUser && (
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
                />
              )}
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
          onRequireSignIn={() => handleLoginAs('usr-stu-1')}
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
