import { useState, useRef, useEffect } from 'react';
import {
  Droplet,
  AlertCircle,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ShieldCheck,
  HeartHandshake,
  Hospital,
  Stethoscope,
  Truck,
  Database,
  CalendarCheck2,
  Settings,
  Search
} from 'lucide-react';
import { User, UserRole } from '../types';
import { db } from '../db/databaseStore';

interface NavbarProps {
  currentUser: User | null;
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: (role?: UserRole, isSignUp?: boolean) => void;
  onOpenEmergency: () => void;
  onOpenBooking: () => void;
  onLogout: () => void;
  onOpenTracker?: () => void;
  onOpenEligibilityCheck?: () => void;
  onOpenDatabase?: () => void;
  onOpenQuickSearch?: () => void;
}

export default function Navbar({
  currentUser,
  activeView,
  onNavigate,
  onOpenAuth,
  onOpenEmergency,
  onOpenBooking,
  onLogout,
  onOpenTracker,
  onOpenEligibilityCheck,
  onOpenDatabase,
  onOpenQuickSearch
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState(db.getLiveStatus());
  const userMenuRef = useRef<HTMLDivElement>(null);
  const canManageDb = (currentUser?.permissions ?? []).includes('db:manage');

  useEffect(() => {
    return db.subscribe(() => {
      setLiveStatus(db.getLiveStatus());
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getDashboardView = (role: UserRole) => {
    switch (role) {
      case 'donor': return 'donor_dashboard';
      case 'hospital': return 'hospital_dashboard';
      case 'staff': return 'staff_dashboard';
      case 'admin': return 'admin_dashboard';
    }
  };

  const navItems = [
    { id: 'blood_map', label: 'Blood Map', onClick: () => onNavigate('blood_map') },
    { id: 'availability', label: 'Find Blood', onClick: () => onNavigate('availability') },
    { id: 'ai_care', label: 'AI Care', onClick: () => onNavigate('ai_care') },
    { id: 'find_donors', label: 'Find Donors', onClick: () => onNavigate('find_donors') },
    { id: 'camps', label: 'Camps', onClick: () => onNavigate('camps') },
    { id: 'compatibility', label: 'Compatibility', onClick: () => onNavigate('compatibility') }
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            id="navbar-brand-logo"
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-lg bg-rose-700 text-white flex items-center justify-center">
              <Droplet className="w-4 h-4 fill-white" />
            </span>
            <span>
              Blood<span className="text-rose-700">Connect</span>
            </span>
          </button>

          {/* Zone 2: 5 Clean Single-Line Text Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7" aria-label="Main navigation">
            {navItems.map(item => {
              const isActive =
                activeView === item.id ||
                (item.id === 'availability' && activeView === 'find_blood');
              return (
                <button
                  key={item.id}
                  id={`nav-link-${item.id}`}
                  type="button"
                  onClick={item.onClick}
                  className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-slate-950 font-semibold'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-700 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action + Account Control */}
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            {onOpenQuickSearch && (
              <button
                id="navbar-quick-search-btn"
                type="button"
                onClick={onOpenQuickSearch}
                title="Quick search blood stock, hospitals & actions (Ctrl+K)"
                aria-label="Quick search (Ctrl+K)"
                className="p-2 rounded-lg text-slate-600 hover:text-slate-950 border border-slate-200 hover:border-slate-300 bg-white transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button
              id="navbar-emergency-cta"
              type="button"
              onClick={onOpenEmergency}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-700 text-white hover:bg-rose-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Emergency Request</span>
            </button>

            {currentUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  id="navbar-user-profile-btn"
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center font-semibold text-[11px]">
                    {currentUser.fullName.charAt(0)}
                  </span>
                  <span className="max-w-[110px] truncate font-semibold text-slate-900">
                    {currentUser.fullName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-lg py-2 z-50">
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-900">{currentUser.fullName}</div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {currentUser.roleName || currentUser.role} · {currentUser.email}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(getDashboardView(currentUser.role));
                          setUserMenuOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <UserIcon className="w-4 h-4 text-slate-400" />
                        <span>My Dashboard</span>
                      </button>

                      <button
                        id="navbar-account-settings-btn"
                        type="button"
                        onClick={() => {
                          onNavigate('account_settings');
                          setUserMenuOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Account &amp; Security Settings</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenBooking();
                          setUserMenuOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <CalendarCheck2 className="w-4 h-4 text-slate-400" />
                        <span>Book Donation Slot</span>
                      </button>

                      {onOpenTracker && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenTracker();
                            setUserMenuOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Truck className="w-4 h-4 text-slate-400" />
                          <span>Track Live Dispatch</span>
                        </button>
                      )}

                      {onOpenDatabase && canManageDb && (
                        <button
                          id="navbar-mysql-database-btn"
                          type="button"
                          onClick={() => {
                            onOpenDatabase();
                            setUserMenuOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <Database className="w-4 h-4 text-slate-400" />
                            <span>MySQL Database Console</span>
                          </span>
                          <span className={`text-[11px] font-medium ${liveStatus.isLiveConnected ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {liveStatus.isLiveConnected ? 'Live' : 'Local'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        id="navbar-logout-btn"
                        type="button"
                        onClick={() => {
                          onLogout();
                          setUserMenuOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                id="navbar-login-btn"
                type="button"
                onClick={() => onOpenAuth()}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 hover:text-slate-950 hover:border-slate-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile Controls */}
          <div className="flex lg:hidden items-center gap-2">
            <button
              type="button"
              onClick={onOpenEmergency}
              className="px-3 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer sm:hidden"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Urgent</span>
            </button>
            <button
              id="navbar-mobile-toggle"
              type="button"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1.5">
          <button
            type="button"
            onClick={() => { onNavigate('home'); setMobileMenuOpen(false); }}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Home
          </button>
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => { item.onClick(); setMobileMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {item.label}
            </button>
          ))}
          {onOpenEligibilityCheck && (
            <button
              type="button"
              onClick={() => { onOpenEligibilityCheck(); setMobileMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              60-Sec Eligibility Pre-Check
            </button>
          )}
          {onOpenTracker && (
            <button
              type="button"
              onClick={() => { onOpenTracker(); setMobileMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Track Emergency Dispatch
            </button>
          )}
          {onOpenDatabase && canManageDb && (
            <button
              type="button"
              onClick={() => { onOpenDatabase(); setMobileMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
            >
              <span>MySQL Database Console</span>
              <span className="text-xs text-slate-500">{liveStatus.isLiveConnected ? 'Live' : 'Local'}</span>
            </button>
          )}
          {currentUser && (
            <button
              type="button"
              onClick={() => { onNavigate('account_settings'); setMobileMenuOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Account &amp; Security Settings
            </button>
          )}

          <div className="pt-3 mt-2 border-t border-slate-200">
            {currentUser ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { onNavigate(getDashboardView(currentUser.role)); setMobileMenuOpen(false); }}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold text-center"
                >
                  Open {currentUser.role} Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => { onLogout(); setMobileMenuOpen(false); }}
                  className="py-2.5 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-rose-700"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { onOpenAuth(); setMobileMenuOpen(false); }}
                  className="flex-1 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { onOpenAuth('donor', true); setMobileMenuOpen(false); }}
                  className="flex-1 py-2.5 text-xs font-semibold bg-rose-700 text-white rounded-lg"
                >
                  Register as Donor
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
