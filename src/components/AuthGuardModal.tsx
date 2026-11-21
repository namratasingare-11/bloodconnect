import { ShieldAlert, LogIn, UserPlus, X, Stethoscope, ShieldCheck, HeartHandshake } from 'lucide-react';
import { UserRole } from '../types';

interface AuthGuardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLogin: (role?: UserRole) => void;
  onOpenSignUp: () => void;
  title?: string;
  message?: string;
}

export default function AuthGuardModal({
  isOpen,
  onClose,
  onOpenLogin,
  onOpenSignUp,
  title = 'This service requires authorization.',
  message = 'Sign in to access donor search, personalized information, and blood-bank services.'
}: AuthGuardModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative corner glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-rose-100 rounded-full blur-2xl pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 shadow-xs">
            <ShieldAlert className="w-8 h-8 text-rose-600" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              {message}
            </p>
          </div>

          {/* Privacy Notice Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>DBMS Privacy & Security Enforcement (RBAC)</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-normal">
              In accordance with healthcare data protection guidelines, donor personal contact and health history are strictly protected. Authenticated staff and administrators have full search access.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenSignUp();
              }}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors border border-slate-200"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Account</span>
            </button>
          </div>

          {/* Verified Role Fast-Track */}
          <div className="pt-4 border-t border-slate-100 text-center">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
              Verified Healthcare Role Direct Sign In
            </span>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  onClose();
                  onOpenLogin('staff');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Login as Staff</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenLogin('admin');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Login as Admin</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenLogin('donor');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>Login as Donor</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
