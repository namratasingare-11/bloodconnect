import { useState, useEffect } from 'react';
import {
  User,
  UserRole,
  DonationCamp,
  BloodSearchIntent,
  BloodMapIntent,
  EmergencyPrefill,
  BookingPrefill,
  DonationAppointment
} from './types';
import { db } from './db/databaseStore';
import { authApi } from './services/authApi';
import {
  DASHBOARD_VIEW_BY_ROLE,
  ROLE_LABELS,
  VIEW_LABELS,
  VIEW_PATHS,
  resolveViewFromPath
} from './config/constants';
import { useToast } from './hooks/useToast';
import { ToastNotification } from './components/ui/ToastNotification';

// Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './components/LandingPage';
import DonorDashboard from './components/DonorDashboard';
import HospitalDashboard from './components/HospitalDashboard';
import StaffDashboard from './components/StaffDashboard';
import AdminDashboard from './components/AdminDashboard';
import AccountSettingsPage from './components/AccountSettingsPage';
import CampsPage from './components/CampsPage';
import ReportsPage from './components/ReportsPage';
import DbmsArchitecturePage from './components/DbmsArchitecturePage';
import FindBloodView from './components/FindBloodView';
import FindDonorsView from './components/FindDonorsView';
import BloodCompatibilityMatrix from './components/BloodCompatibilityMatrix';
import EmergencyDispatchTrackerModal from './components/EmergencyDispatchTrackerModal';
import DonorEligibilityCheckModal from './components/DonorEligibilityCheckModal';
import AuthPage from './components/AuthPage';
import AuthGuardModal from './components/AuthGuardModal';
import EmergencyModal from './components/EmergencyModal';
import DonationBookingModal from './components/DonationBookingModal';
import MySQLConnectionModal from './components/MySQLConnectionModal';
import QuickSearchPalette from './components/QuickSearchPalette';
import RegionalBloodMapView from './components/RegionalBloodMapView';
import AiCareDeskView from './components/AiCareDeskView';
import QuickAiDrawer from './components/QuickAiDrawer';

import { ChevronRight, ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [currentView, setCurrentView] = useState<string>(() =>
    typeof window !== 'undefined' ? resolveViewFromPath(window.location.pathname) : 'home'
  );

  // Auth & Return-to-Intent state
  const [authGuardOpen, setAuthGuardOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<UserRole | undefined>(undefined);
  const [authModalIsSignUp, setAuthModalIsSignUp] = useState(false);
  const [authContextNotice, setAuthContextNotice] = useState<string | null>(null);
  const [pendingViewAfterAuth, setPendingViewAfterAuth] = useState<string | null>(null);

  // Context-Aware Cross-Page Intents
  const [bloodSearchIntent, setBloodSearchIntent] = useState<BloodSearchIntent | null>(null);
  const [bloodMapIntent, setBloodMapIntent] = useState<BloodMapIntent | null>(null);
  const [aiDeskTab, setAiDeskTab] = useState<'triage' | 'scanner' | 'coach'>('triage');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyPrefill, setEmergencyPrefill] = useState<EmergencyPrefill | null>(null);

  // Direct Donation Appointment Booking & Digital Pass
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<BookingPrefill | null>(null);
  const [viewingAppointmentPass, setViewingAppointmentPass] = useState<DonationAppointment | null>(null);

  // Other Modals
  const [selectedCampForReg, setSelectedCampForReg] = useState<DonationCamp | null>(null);
  const [mySQLModalOpen, setMySQLModalOpen] = useState(false);
  const [dispatchTrackerOpen, setDispatchTrackerOpen] = useState(false);
  const [trackedRequestCode, setTrackedRequestCode] = useState<string | undefined>(undefined);
  const [eligibilityModalOpen, setEligibilityModalOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  // Global Non-Blocking Toast
  const { toastMessage, showToast, dismissToast } = useToast(4000);

  // Hydrate authenticated session exclusively from the server HttpOnly cookie
  useEffect(() => {
    let active = true;
    authApi
      .getMe()
      .then((res) => {
        if (!active) return;
        setCurrentUser(res.user);
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        db.clearSession();
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync browser URL, Back/Forward navigation, and document title with currentView
  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(resolveViewFromPath(window.location.pathname));
    };
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickSearchOpen(prev => !prev);
      }
    };
    const handleGmpQuotaExceeded = () => {
      setGmpQuotaExceeded(true);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleGlobalShortcut);
    window.addEventListener('gmp-quota-exceeded', handleGmpQuotaExceeded);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleGlobalShortcut);
      window.removeEventListener('gmp-quota-exceeded', handleGmpQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    const targetPath = VIEW_PATHS[currentView] || '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view: currentView }, '', targetPath);
    }
    const pageTitle = VIEW_LABELS[currentView];
    document.title = pageTitle
      ? `${pageTitle} · BloodConnect`
      : 'BloodConnect · Verified Blood Bank & Voluntary Donor Network';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  const getDashboardForRole = (role: UserRole) => DASHBOARD_VIEW_BY_ROLE[role];

  const handleNavigate = (view: string) => {
    setAuthContextNotice(null);
    setCurrentView(view);
  };

  const handleSearchBlood = (intent: BloodSearchIntent) => {
    setBloodSearchIntent({ ...intent });
    setCurrentView('availability');
  };

  const handleOpenBloodMap = (intent?: BloodMapIntent) => {
    setBloodMapIntent(intent ? { ...intent } : null);
    setCurrentView('blood_map');
  };

  const handleOpenAiDesk = (tab: 'triage' | 'scanner' | 'coach' = 'triage') => {
    setAiDeskTab(tab);
    setCurrentView('ai_care');
  };

  const handleOpenEmergency = (prefill?: EmergencyPrefill) => {
    setEmergencyPrefill(prefill ? { ...prefill } : null);
    setEmergencyModalOpen(true);
  };

  const handleOpenBooking = (prefill?: BookingPrefill) => {
    setViewingAppointmentPass(null);
    setBookingPrefill(prefill ? { ...prefill } : null);
    setBookingModalOpen(true);
  };

  const handleViewAppointmentPass = (appointment: DonationAppointment) => {
    setBookingPrefill(null);
    setViewingAppointmentPass(appointment);
    setBookingModalOpen(true);
  };

  const handleOpenAuth = (role?: UserRole, isSignUp?: boolean, notice?: string) => {
    setAuthModalRole(role);
    setAuthModalIsSignUp(!!isSignUp);
    setAuthContextNotice(notice || null);
    setCurrentView('auth');
  };

  const hasPermission = (permission: string) =>
    Boolean(currentUser?.permissions?.includes(permission));

  const canAccessView = (view: string): boolean => {
    if (!currentUser) return false;
    if (view === 'account_settings') return true;
    if (view === 'donor_dashboard') return true;
    if (view === 'hospital_dashboard') {
      return currentUser.role === 'hospital' || currentUser.role === 'admin' || hasPermission('requests:create');
    }
    if (view === 'staff_dashboard') {
      return (
        currentUser.role === 'staff' ||
        currentUser.role === 'admin' ||
        hasPermission('inventory:manage') ||
        hasPermission('donors:verify')
      );
    }
    if (view === 'admin_dashboard') {
      return (
        currentUser.role === 'admin' ||
        hasPermission('users:read') ||
        hasPermission('roles:read') ||
        hasPermission('audit:read')
      );
    }
    return true;
  };

  // Safe portal routing: requires genuine server authentication
  const handleNavigatePortal = (role: UserRole) => {
    const targetDashboard = getDashboardForRole(role);
    if (currentUser) {
      setCurrentView(targetDashboard);
      return;
    }
    setPendingViewAfterAuth(targetDashboard);
    handleOpenAuth(role, false, `Sign in with an authorized account to access the ${ROLE_LABELS[role]}.`);
  };

  const handleOpenDatabase = () => {
    if (!currentUser) {
      setPendingViewAfterAuth('admin_dashboard');
      handleOpenAuth('admin', false, 'Sign in with an Administrator account (db:manage permission) to access the MySQL Console.');
      return;
    }
    if (!hasPermission('db:manage')) {
      showToast('Access denied: MySQL Database Console requires the db:manage permission.');
      return;
    }
    setMySQLModalOpen(true);
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setAuthContextNotice(null);
    if (pendingViewAfterAuth) {
      const target = pendingViewAfterAuth;
      setPendingViewAfterAuth(null);
      if (target.endsWith('_dashboard')) {
        setCurrentView(getDashboardForRole(user.role));
      } else {
        setCurrentView(target);
      }
    } else {
      setCurrentView(getDashboardForRole(user.role));
    }
    showToast(`Signed in as ${user.fullName} (${user.roleName || user.role}).`);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Proceed with local cleanup even if network fails
    }
    db.clearSession();
    setCurrentUser(null);
    setCurrentView('home');
    showToast('You have been securely signed out and your session was revoked.');
  };

  const isProtectedView =
    currentView === 'donor_dashboard' ||
    currentView === 'hospital_dashboard' ||
    currentView === 'staff_dashboard' ||
    currentView === 'admin_dashboard' ||
    currentView === 'account_settings';

  const breadcrumbLabel = VIEW_LABELS[currentView];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Top-Level Google Maps Platform Quota Notice Banner (persists across view changes) */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Global Non-Blocking Toast Notification */}
      <ToastNotification message={toastMessage} onDismiss={dismissToast} />

      {/* Single Disciplined 3-Zone Clinical Header */}
      <Navbar
        activeView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={(role, isSignUp) => handleOpenAuth(role, isSignUp)}
        onOpenEmergency={() => handleOpenEmergency()}
        onOpenBooking={() => handleOpenBooking()}
        onOpenTracker={() => {
          setTrackedRequestCode(undefined);
          setDispatchTrackerOpen(true);
        }}
        onOpenEligibilityCheck={() => setEligibilityModalOpen(true)}
        onOpenDatabase={handleOpenDatabase}
        onOpenQuickSearch={() => setQuickSearchOpen(true)}
      />

      {/* Quiet Breadcrumb Bar on Sub-Pages */}
      {currentView !== 'home' && currentView !== 'auth' && breadcrumbLabel && (
        <div className="bg-white border-b border-slate-200 no-print">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className="hover:text-slate-900 transition-colors cursor-pointer"
              >
                Home
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="font-medium text-slate-900">{breadcrumbLabel}</span>
            </div>
            {currentUser && (
              <span className="hidden sm:inline text-slate-500">
                Signed in as <strong className="font-medium text-slate-800">{currentUser.fullName}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {(currentView === 'auth' || (isProtectedView && !currentUser && !sessionLoading)) && (
          <AuthPage
            initialMode={authModalIsSignUp ? 'sign_up' : 'sign_in'}
            initialRole={
              authModalRole ||
              (currentView === 'hospital_dashboard'
                ? 'hospital'
                : currentView === 'staff_dashboard'
                ? 'staff'
                : currentView === 'admin_dashboard'
                ? 'admin'
                : 'donor')
            }
            contextNotice={
              authContextNotice ||
              (isProtectedView && !currentUser
                ? 'Please sign in to access this protected workspace.'
                : null)
            }
            onLoginSuccess={handleLoginSuccess}
            onNavigateHome={() => handleNavigate('home')}
          />
        )}

        {isProtectedView && currentUser && !canAccessView(currentView) && (
          <div className="max-w-xl mx-auto px-4 py-16">
            <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 mx-auto flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-display font-bold text-slate-950">
                403 · Unauthorized Workspace Access
              </h1>
              <p className="text-sm text-slate-600">
                Your server-verified role (<strong>{currentUser.roleName || currentUser.role}</strong>) does
                not hold the required permissions for this portal.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleNavigate(getDashboardForRole(currentUser.role))}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                >
                  Return to My Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('account_settings')}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  View My Permissions
                </button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'home' && (
          <LandingPage
            onNavigate={handleNavigate}
            onSearchBlood={handleSearchBlood}
            onOpenBloodMap={handleOpenBloodMap}
            onOpenAiDesk={handleOpenAiDesk}
            onOpenAuth={(role, isSignUp) => handleOpenAuth(role, isSignUp)}
            onOpenEmergency={handleOpenEmergency}
            onOpenBooking={handleOpenBooking}
            onSelectCamp={camp => {
              setSelectedCampForReg(camp);
              handleNavigate('camps');
            }}
            onOpenEligibilityCheck={() => setEligibilityModalOpen(true)}
            onOpenTracker={() => {
              setTrackedRequestCode(undefined);
              setDispatchTrackerOpen(true);
            }}
            quotaExceeded={gmpQuotaExceeded}
          />
        )}

        {currentView === 'blood_map' && (
          <RegionalBloodMapView
            initialIntent={bloodMapIntent}
            quotaExceeded={gmpQuotaExceeded}
            onOpenEmergency={handleOpenEmergency}
            onOpenBooking={handleOpenBooking}
            onSelectCamp={camp => {
              setSelectedCampForReg(camp);
              handleNavigate('camps');
            }}
          />
        )}

        {currentView === 'ai_care' && (
          <AiCareDeskView
            initialTab={aiDeskTab}
            onOpenBloodMap={handleOpenBloodMap}
            onSearchBlood={handleSearchBlood}
            onOpenEmergency={handleOpenEmergency}
            onOpenBooking={handleOpenBooking}
          />
        )}

        {(currentView === 'find_blood' || currentView === 'availability') && (
          <FindBloodView
            initialIntent={bloodSearchIntent}
            onOpenEmergency={handleOpenEmergency}
            onOpenBooking={handleOpenBooking}
            onNavigateHospital={() => handleNavigatePortal('hospital')}
            onNavigateCompatibility={() => handleNavigate('compatibility')}
          />
        )}

        {currentView === 'compatibility' && (
          <BloodCompatibilityMatrix
            onOpenEmergency={handleOpenEmergency}
            onNavigateBlood={intent => {
              if (intent) handleSearchBlood(intent);
              else handleNavigate('availability');
            }}
            onOpenBooking={handleOpenBooking}
          />
        )}

        {currentView === 'find_donors' && (
          <FindDonorsView
            currentUser={currentUser}
            onOpenAuthGuard={() => setAuthGuardOpen(true)}
            onNavigate={handleNavigate}
            onOpenEligibilityCheck={() => setEligibilityModalOpen(true)}
          />
        )}

        {currentView === 'donor_dashboard' && currentUser && canAccessView('donor_dashboard') && (
          <DonorDashboard
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenCamps={() => handleNavigate('camps')}
            onOpenBooking={() => handleOpenBooking()}
            onViewAppointmentPass={handleViewAppointmentPass}
            onNotify={showToast}
          />
        )}

        {currentView === 'hospital_dashboard' && currentUser && canAccessView('hospital_dashboard') && (
          <HospitalDashboard
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'staff_dashboard' && currentUser && canAccessView('staff_dashboard') && (
          <StaffDashboard
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'admin_dashboard' && currentUser && canAccessView('admin_dashboard') && (
          <AdminDashboard
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenDatabase={handleOpenDatabase}
          />
        )}

        {currentView === 'account_settings' && currentUser && (
          <AccountSettingsPage
            currentUser={currentUser}
            onUserUpdated={(updated) => setCurrentUser(updated)}
            onForceLogout={handleLogout}
            onNotify={showToast}
          />
        )}

        {currentView === 'camps' && (
          <CampsPage
            currentUser={currentUser}
            onOpenAuth={() => {
              setPendingViewAfterAuth('camps');
              handleOpenAuth('donor', false, 'Sign in as a donor to reserve your camp slot.');
            }}
            preSelectedCamp={selectedCampForReg}
          />
        )}

        {currentView === 'reports' && <ReportsPage />}

        {currentView === 'dbms_architecture' && <DbmsArchitecturePage />}
      </main>

      {/* Quiet Editorial Clinical Footer */}
      <Footer
        onNavigate={handleNavigate}
        onNavigatePortal={handleNavigatePortal}
        onOpenEmergency={() => handleOpenEmergency()}
        onOpenBooking={() => handleOpenBooking()}
        onOpenDatabase={handleOpenDatabase}
      />

      {/* Context-Aware Emergency Request Modal */}
      <EmergencyModal
        isOpen={emergencyModalOpen}
        prefill={emergencyPrefill}
        onClose={() => setEmergencyModalOpen(false)}
        onSuccessNavigate={() => handleNavigatePortal('hospital')}
        onTrackDispatch={code => {
          setTrackedRequestCode(code);
          setDispatchTrackerOpen(true);
        }}
        onNotify={showToast}
      />

      {/* Direct Donation Appointment Booking & Digital Pass Modal */}
      <DonationBookingModal
        isOpen={bookingModalOpen}
        onClose={() => {
          setBookingModalOpen(false);
          setViewingAppointmentPass(null);
        }}
        currentUser={currentUser}
        prefill={bookingPrefill}
        viewingPass={viewingAppointmentPass}
        onBooked={apt => {
          showToast(`Donation slot confirmed (${apt.appointmentCode}) for ${apt.appointmentDate}.`);
        }}
        onGoToDashboard={() => handleNavigatePortal('donor')}
      />

      {/* Live Emergency Blood Dispatch Tracker */}
      <EmergencyDispatchTrackerModal
        isOpen={dispatchTrackerOpen}
        onClose={() => setDispatchTrackerOpen(false)}
        initialRequestCode={trackedRequestCode}
      />

      {/* 60-Second Clinical Donor Eligibility Pre-Check */}
      <DonorEligibilityCheckModal
        isOpen={eligibilityModalOpen}
        onClose={() => setEligibilityModalOpen(false)}
        onOpenBooking={() => handleOpenBooking()}
        onOpenRegister={() => handleOpenAuth('donor', true)}
        onOpenCamps={() => handleNavigate('camps')}
      />

      {/* Privacy & RBAC Access Guard Modal */}
      <AuthGuardModal
        isOpen={authGuardOpen}
        onClose={() => setAuthGuardOpen(false)}
        onOpenLogin={role => {
          setAuthGuardOpen(false);
          handleOpenAuth(role, false);
        }}
        onOpenSignUp={() => {
          setAuthGuardOpen(false);
          handleOpenAuth('donor', true);
        }}
      />

      {/* MySQL Connection & Table Setup Manager Modal */}
      <MySQLConnectionModal
        isOpen={mySQLModalOpen}
        onClose={() => setMySQLModalOpen(false)}
      />

      {/* Global Quick Search & Clinical Action Palette (Ctrl+K) */}
      <QuickSearchPalette
        isOpen={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        onNavigate={handleNavigate}
        onSearchBlood={handleSearchBlood}
        onOpenBloodMap={handleOpenBloodMap}
        onOpenAiDesk={handleOpenAiDesk}
        onOpenEmergency={handleOpenEmergency}
        onOpenBooking={() => handleOpenBooking()}
        onOpenTracker={() => {
          setTrackedRequestCode(undefined);
          setDispatchTrackerOpen(true);
        }}
        onOpenEligibility={() => setEligibilityModalOpen(true)}
        onSelectCamp={camp => {
          setSelectedCampForReg(camp);
          handleNavigate('camps');
        }}
      />

      {/* Persistent Quick AI Clinical Care Desk Dock */}
      <QuickAiDrawer
        currentView={currentView}
        onOpenFullDesk={handleOpenAiDesk}
        onOpenBloodMap={handleOpenBloodMap}
        onOpenEmergency={handleOpenEmergency}
      />
    </div>
  );
}
