import { Droplet, Phone, Mail, MapPin, Database } from 'lucide-react';
import { UserRole } from '../types';

interface FooterProps {
  onNavigate: (view: string) => void;
  onNavigatePortal: (role: UserRole) => void;
  onOpenEmergency: () => void;
  onOpenBooking: () => void;
  onOpenDatabase?: () => void;
}

export default function Footer({
  onNavigate,
  onNavigatePortal,
  onOpenEmergency,
  onOpenBooking,
  onOpenDatabase
}: FooterProps) {
  return (
    <footer className="bg-white text-slate-600 border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-200">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2.5 text-lg font-display font-bold tracking-tight text-slate-900 cursor-pointer"
            >
              <span className="w-7 h-7 rounded-lg bg-rose-700 text-white flex items-center justify-center">
                <Droplet className="w-4 h-4 fill-white" />
              </span>
              <span>
                Blood<span className="text-rose-700">Connect</span>
              </span>
            </button>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
              Accredited blood bank network connecting voluntary donors, hospital transfusion desks, and 24/7 cold-chain vaults across Maharashtra.
            </p>
            <div className="text-xs text-slate-500 pt-1">
              SBTC &amp; CDSCO Certified · 100% NAT Screened · 100% Voluntary Network
            </div>
          </div>

          {/* Public Services */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-900">Clinical Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button type="button" onClick={() => onNavigate('blood_map')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Live Regional Blood Map
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('ai_care')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  AI Clinical Care Desk
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('availability')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Live Blood Inventory
                </button>
              </li>
              <li>
                <button type="button" onClick={onOpenBooking} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Book Donation Appointment
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('camps')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Blood Donation Camps
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('compatibility')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Compatibility Matrix
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('reports')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Analytics &amp; Reports
                </button>
              </li>
            </ul>
          </div>

          {/* Role Portals & Data Systems */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-900">Portals &amp; Systems</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button type="button" onClick={() => onNavigatePortal('donor')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Donor Portal
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigatePortal('hospital')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Hospital Transfusion Desk
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigatePortal('staff')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  Laboratory &amp; Staff Desk
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigatePortal('admin')} className="hover:text-rose-700 transition-colors cursor-pointer">
                  System Administration
                </button>
              </li>
              <li className="pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onNavigate('dbms_architecture')}
                  className="text-xs text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  DBMS Schema &amp; Specifications
                </button>
              </li>
              {onOpenDatabase && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenDatabase}
                    className="text-xs font-medium text-slate-700 hover:text-rose-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5 text-slate-400" />
                    <span>MySQL Database Console</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* 24/7 Emergency Desk */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-rose-700">24/7 Emergency Desk</h4>
            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-mono font-semibold text-slate-900">1800-11-9999</div>
                  <div className="text-slate-500">Toll-Free ICU Dispatch · +91 22 2400-25663</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">emergency@bloodconnect.org</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>Central Blood Transfusion Council, Bandra Health Complex, Mumbai</span>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenEmergency}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  Request Urgent Blood
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Copyright & Compliance Row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div>
            &copy; {new Date().getFullYear()} BloodConnect. National Blood Transfusion &amp; Voluntary Donor Network.
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>NABH &amp; CDSCO Compliant · 2°C–6°C Cold-Chain Monitored</span>
            <span>·</span>
            <a
              href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 underline"
            >
              Google Maps Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
