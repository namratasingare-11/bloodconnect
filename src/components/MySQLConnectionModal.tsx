import { useState, useEffect, FormEvent } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  Download, 
  Upload,
  Terminal, 
  Server, 
  Key, 
  X, 
  Layers,
  ExternalLink,
  ShieldCheck,
  Play,
  Sparkles,
  Code,
  Table as TableIcon,
  Laptop,
  ArrowRight,
  Globe,
  Zap,
  FolderDown,
  Info
} from 'lucide-react';
import { db } from '../db/databaseStore';
import { databaseApi } from '../services/databaseApi';

interface MySQLConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MySQLConnectionModal({ isOpen, onClose }: MySQLConnectionModalProps) {
  const [testing, setTesting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'form' | 'uri'>('form');
  const [rawUri, setRawUri] = useState('');

  // Connection form defaults (passwords are never hardcoded in source code)
  const [dbConfig, setDbConfig] = useState({
    host: 'localhost',
    port: '3306',
    user: 'root',
    password: '',
    database: 'bloodconnect_db',
    ssl: false,
    uri: '',
  });

  const [statusResult, setStatusResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    tables?: string[];
    counts?: Record<string, number>;
  }>({
    tested: false,
    success: false,
    message: 'Click "Test Connection" or "Create Database & Tables" to initialize MySQL.',
  });

  const [activeTab, setActiveTab] = useState<'status' | 'laptop' | 'tables' | 'query_console' | 'setup_guides'>('status');
  const [initResult, setInitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; counts?: any } | null>(null);
  const [liveStoreStatus, setLiveStoreStatus] = useState(db.getLiveStatus());

  // Subscribe to databaseStore changes
  useEffect(() => {
    return db.subscribe(() => {
      setLiveStoreStatus(db.getLiveStatus());
    });
  }, []);

  // Laptop Tunnel state
  const [laptopTunnelInput, setLaptopTunnelInput] = useState('');
  const [parsedTunnel, setParsedTunnel] = useState<{ host: string; port: string } | null>(null);
  const [laptopConnecting, setLaptopConnecting] = useState(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM blood_groups;');
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    success: boolean;
    message: string;
    rows?: any[];
    fields?: string[];
    durationMs?: number;
  } | null>(null);

  // Check current server status when modal opens
  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const handleUriChange = (uriVal: string) => {
    setRawUri(uriVal);
    if (!uriVal.trim()) return;
    try {
      const url = new URL(uriVal.trim());
      setDbConfig(prev => ({
        ...prev,
        host: url.hostname || prev.host,
        port: url.port ? String(url.port) : '3306',
        user: decodeURIComponent(url.username || 'root'),
        password: url.password ? decodeURIComponent(url.password) : prev.password,
        database: url.pathname.replace(/^\//, '') || prev.database,
        ssl: url.searchParams.get('ssl-mode') === 'REQUIRED' || url.searchParams.get('ssl') === 'true' || url.protocol === 'mysqls:',
        uri: uriVal.trim(),
      }));
    } catch {
      // Partially typed URI, keep as is
    }
  };

  const checkStatus = async () => {
    setTesting(true);
    try {
      const data = await databaseApi.getStatus();
      setStatusResult({
        tested: true,
        success: data.success,
        message: data.message,
        tables: data.tables,
        counts: data.counts,
      });
      if (data.config) {
        setDbConfig(prev => ({
          ...prev,
          host: data.config?.host || prev.host,
          port: String(data.config?.port || prev.port),
          user: data.config?.user || prev.user,
          database: data.config?.database || prev.database,
        }));
      }
    } catch {
      setStatusResult({
        tested: true,
        success: false,
        message: 'Could not connect to backend server. Ensure the app server is running.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleTestConnection = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setTesting(true);
    setInitResult(null);
    try {
      const data = await databaseApi.testConnection(dbConfig);
      setStatusResult({
        tested: true,
        success: data.success,
        message: data.message,
        tables: data.tables,
        counts: data.counts,
      });
    } catch (err: any) {
      setStatusResult({
        tested: true,
        success: false,
        message: err.message || 'Failed to ping MySQL server',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleInitTables = async () => {
    setInitializing(true);
    setInitResult(null);
    try {
      const data = await databaseApi.initTables(dbConfig);
      setInitResult({ success: Boolean(data.success), message: data.message });
      await checkStatus();
    } catch (err: any) {
      setInitResult({ success: false, message: `Error initializing tables: ${err.message}` });
    } finally {
      setInitializing(false);
    }
  };

  const handleSeedData = async () => {
    setSeeding(true);
    setInitResult(null);
    try {
      const data = await databaseApi.seedSampleData(dbConfig);
      setInitResult({ success: Boolean(data.success), message: data.message });
      await checkStatus();
    } catch (err: any) {
      setInitResult({ success: false, message: `Error seeding tables: ${err.message}` });
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateDatabaseAndSetupAll = async () => {
    setInitializing(true);
    setInitResult(null);
    try {
      const dataInit = await databaseApi.initTables(dbConfig);

      if (dataInit.success) {
        await databaseApi.seedSampleData(dbConfig);
      }

      setInitResult({
        success: Boolean(dataInit.success),
        message: dataInit.success
          ? 'Database bloodconnect_db and all relational tables created and seeded in MySQL.'
          : dataInit.message,
      });
      if (dataInit.success) {
        db.setLiveConnected(true);
      }
      await checkStatus();
    } catch (err: any) {
      setInitResult({ success: false, message: `Creation error: ${err.message}` });
    } finally {
      setInitializing(false);
    }
  };

  const handleConnectLiveDatabase = async () => {
    setTesting(true);
    setInitResult(null);
    setSyncResult(null);
    try {
      const data = await databaseApi.connect(dbConfig);
      setStatusResult({
        tested: true,
        success: data.success,
        message: data.message,
        tables: data.tables,
        counts: data.counts,
      });
      if (data.success) {
        db.setLiveConnected(true);
        setSyncResult({
          success: true,
          message: 'Connected live to MySQL! All schemas verified. Two-way live synchronization active.',
          counts: data.counts,
        });
      } else {
        setSyncResult({
          success: false,
          message: data.message || 'Could not connect to MySQL database.',
        });
      }
    } catch (err: any) {
      setStatusResult({
        tested: true,
        success: false,
        message: err.message || 'Connection attempt failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handlePushAllToMySQL = async () => {
    setIsLiveSyncing(true);
    setSyncResult(null);
    try {
      const res = await db.pushAllToMySQL();
      setSyncResult(res);
      await checkStatus();
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || 'Push sync failed' });
    } finally {
      setIsLiveSyncing(false);
    }
  };

  const handlePullAllFromMySQL = async () => {
    setIsLiveSyncing(true);
    setSyncResult(null);
    try {
      const res = await db.pullFromMySQL();
      setSyncResult(res);
      await checkStatus();
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || 'Pull sync failed' });
    } finally {
      setIsLiveSyncing(false);
    }
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    setQueryRunning(true);
    setQueryResult(null);
    try {
      const data = await databaseApi.runQuery(sqlQuery, dbConfig);
      setQueryResult(data);
    } catch (err: any) {
      setQueryResult({
        success: false,
        message: err.message || 'Failed to execute query',
      });
    } finally {
      setQueryRunning(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const handleDownloadSchema = () => {
    window.location.href = '/api/db/schema.sql';
  };

  const handleLaptopTunnelInputChange = (val: string) => {
    setLaptopTunnelInput(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setParsedTunnel(null);
      return;
    }

    // Parse formats like "tcp://0.tcp.in.ngrok.io:19423", "localhost:3306", or mysql:// URIs
    let clean = trimmed.replace(/^(tcp:\/\/|http:\/\/|https:\/\/)/, '');
    if (clean.includes('@')) {
      clean = clean.split('@')[1];
    }
    clean = clean.split('/')[0].split('?')[0];

    const colonIdx = clean.lastIndexOf(':');
    if (colonIdx > 0) {
      const host = clean.slice(0, colonIdx);
      const port = clean.slice(colonIdx + 1).replace(/[^0-9]/g, '');
      if (host && port) {
        setParsedTunnel({ host, port });
        return;
      }
    }
    setParsedTunnel(null);
  };

  const handleConnectLaptopTunnel = async () => {
    if (!parsedTunnel) return;
    setLaptopConnecting(true);
    setTesting(true);
    setInitResult(null);

    const targetConfig = {
      ...dbConfig,
      host: parsedTunnel.host,
      port: parsedTunnel.port,
      user: dbConfig.user || 'root',
      password: dbConfig.password || '',
      database: dbConfig.database || 'bloodconnect_db',
    };
    setDbConfig(targetConfig);

    try {
      const data = await databaseApi.testConnection(targetConfig);
      setStatusResult({
        tested: true,
        success: data.success,
        message: data.message,
        tables: data.tables,
        counts: data.counts,
      });

      if (data.success) {
        db.setLiveConnected(true);
        const initData = await databaseApi.initTables(targetConfig);
        setInitResult({
          success: initData.success,
          message: initData.message || 'Laptop MySQL connected and tables verified.',
        });
      }
    } catch (err: any) {
      setStatusResult({
        tested: true,
        success: false,
        message: err.message || 'Failed to ping laptop MySQL tunnel',
      });
    } finally {
      setLaptopConnecting(false);
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center shadow-md">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white">MySQL Database &amp; Schema Manager</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusResult.success 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusResult.success ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                  {statusResult.success ? 'MySQL Connected (InnoDB)' : 'Ready to Connect / Local Store'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Target DB: <code className="font-mono text-purple-200 font-bold">{dbConfig.database}</code> &bull; Host: <code className="font-mono text-purple-200">{dbConfig.host}:{dbConfig.port}</code> &bull; User: <code className="font-mono text-purple-200">{dbConfig.user}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Banner: Instant One-Click Create Database & Tables */}
        <div className="p-4 bg-purple-50/80 border-b border-purple-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-purple-600 shrink-0" />
            <div>
              <span className="text-xs font-black text-purple-950 block">Quick Database Creation &amp; Auto-Setup</span>
              <span className="text-[11px] text-purple-800">
                Executes DDL statements to create database <code className="font-mono font-bold">bloodconnect_db</code>, all 9 3NF tables, constraints, and seed data.
              </span>
            </div>
          </div>

          <button
            onClick={handleCreateDatabaseAndSetupAll}
            disabled={initializing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Layers className={`w-3.5 h-3.5 ${initializing ? 'animate-spin' : ''}`} />
            <span>{initializing ? 'Creating Database & Tables...' : 'CREATE DATABASE & TABLES'}</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-slate-200 flex gap-2 bg-slate-50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-3 px-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'status'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Connection &amp; Credentials</span>
          </button>
          <button
            onClick={() => setActiveTab('laptop')}
            className={`py-3 px-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'laptop'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-purple-600" />
            <span>Connect Laptop MySQL</span>
            <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold tracking-wide">
              Step-by-Step
            </span>
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`py-3 px-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tables'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Schema &amp; 9 Tables</span>
          </button>
          <button
            onClick={() => setActiveTab('query_console')}
            className={`py-3 px-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'query_console'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Interactive SQL Console</span>
          </button>
          <button
            onClick={() => setActiveTab('setup_guides')}
            className={`py-3 px-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'setup_guides'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Setup Guides</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'status' && (
            <div className="space-y-5">
              {/* Laptop Bridge Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-600/30">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <span>Connect with MySQL on your physical laptop</span>
                      <span className="px-1.5 py-0.2 rounded bg-purple-200/80 text-purple-900 text-[10px] font-bold">Recommended</span>
                    </h5>
                    <p className="text-[11px] text-purple-700 mt-0.5 leading-snug">
                      Cloud container requires a bridge to reach <code className="font-mono font-bold">localhost:3306</code> on your machine.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('laptop')}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs shrink-0 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>Open Laptop Guide</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Connection Status Box */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                statusResult.success || liveStoreStatus.isLiveConnected
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-2xs'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}>
                {statusResult.success || liveStoreStatus.isLiveConnected ? (
                  <div className="relative shrink-0 mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 relative" />
                  </div>
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-1.5 flex-1">
                  <div className="font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>{statusResult.success || liveStoreStatus.isLiveConnected ? 'MySQL Live Connected & Synced' : 'Local Fallback / Awaiting Live Connection'}</span>
                      {(statusResult.success || liveStoreStatus.isLiveConnected) && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-black uppercase tracking-wider">
                          Real-Time Active
                        </span>
                      )}
                    </span>
                    <button
                      onClick={checkStatus}
                      disabled={testing}
                      className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-normal underline cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                  <p className="leading-relaxed opacity-90">{statusResult.message}</p>
                  
                  {/* Live Table Counts Grid */}
                  {statusResult.counts && Object.keys(statusResult.counts).length > 0 && (
                    <div className="pt-2">
                      <div className="text-[11px] font-bold text-emerald-900 mb-1">Live MySQL Records:</div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                        {Object.entries(statusResult.counts).map(([tbl, cnt]) => (
                          <span key={tbl} className="px-2 py-0.5 bg-white/90 rounded-md border border-emerald-200 text-emerald-800 shadow-2xs">
                            {tbl}: <strong>{cnt}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* LIVE TWO-WAY DATA SYNC COMMAND CENTER */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/70 to-slate-50 border border-purple-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <span>Live Database Two-Way Synchronization</span>
                        {liveStoreStatus.lastSyncTime && (
                          <span className="text-[10px] font-normal text-slate-500 font-mono">
                            (Last synced: {liveStoreStatus.lastSyncTime})
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        Synchronize existing donors, blood requests, and inventory units into live MySQL tables.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3 Live Sync Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleConnectLiveDatabase}
                    disabled={testing}
                    className="p-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-left transition-all flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-black">1. Connect &amp; Initialize</span>
                      <Zap className={`w-3.5 h-3.5 text-purple-200 group-hover:scale-110 transition-transform ${testing ? 'animate-pulse' : ''}`} />
                    </div>
                    <span className="text-[10px] text-purple-200 leading-tight">
                      Binds MySQL connection and builds 9 relational tables.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePushAllToMySQL}
                    disabled={isLiveSyncing}
                    className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-left transition-all flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-black">2. Push Data to MySQL</span>
                      <Upload className={`w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform ${isLiveSyncing ? 'animate-bounce' : ''}`} />
                    </div>
                    <span className="text-[10px] text-slate-300 leading-tight">
                      Exports local baseline donors &amp; units into MySQL tables.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePullAllFromMySQL}
                    disabled={isLiveSyncing}
                    className="p-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-left transition-all flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-black">3. Pull Live Records</span>
                      <Download className={`w-3.5 h-3.5 text-emerald-200 group-hover:scale-110 transition-transform ${isLiveSyncing ? 'animate-bounce' : ''}`} />
                    </div>
                    <span className="text-[10px] text-emerald-100 leading-tight">
                      Fetches fresh rows from MySQL into frontend views.
                    </span>
                  </button>
                </div>

                {/* Real-time Write-Through Explanation */}
                <div className="p-2.5 rounded-xl bg-white/80 border border-purple-100 text-[11px] text-purple-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Write-Through CRUD Active:</strong> Any new Donor Registration, Emergency Request, or Blood Donation in this app automatically syncs directly to your live MySQL database!
                  </span>
                </div>

                {/* Sync Feedback Alert */}
                {syncResult && (
                  <div className={`p-3 rounded-xl text-xs font-semibold border flex items-start gap-2 ${
                    syncResult.success 
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}>
                    {syncResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <span>{syncResult.message}</span>
                      {syncResult.counts && (
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono">
                          {Object.entries(syncResult.counts).map(([k, v]) => (
                            <span key={k} className="px-1.5 py-0.5 bg-white rounded border border-emerald-200">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Credentials Form */}
              <form onSubmit={handleTestConnection} className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Connection Settings</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInputMode('form')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                        inputMode === 'form'
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Host &amp; Port
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('uri')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                        inputMode === 'uri'
                          ? 'bg-purple-100 text-purple-700'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Connection URI
                    </button>
                  </div>
                </div>

                {inputMode === 'uri' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      MySQL Connection String (URI)
                    </label>
                    <input
                      type="text"
                      value={rawUri || dbConfig.uri || ''}
                      onChange={e => handleUriChange(e.target.value)}
                      placeholder="mysql://root:<password>@localhost:3306/bloodconnect_db"
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-[11px] text-slate-500">
                      Supports cloud instances from Aiven, PlanetScale, Railway, AWS RDS, and local instances.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Host / Server IP</label>
                      <input
                        type="text"
                        value={dbConfig.host}
                        onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })}
                        placeholder="localhost or 127.0.0.1"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Port</label>
                      <input
                        type="text"
                        value={dbConfig.port}
                        onChange={e => setDbConfig({ ...dbConfig, port: e.target.value })}
                        placeholder="3306"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Database User</label>
                      <input
                        type="text"
                        value={dbConfig.user}
                        onChange={e => setDbConfig({ ...dbConfig, user: e.target.value })}
                        placeholder="root"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Database Password</label>
                      <input
                        type="password"
                        value={dbConfig.password}
                        onChange={e => setDbConfig({ ...dbConfig, password: e.target.value })}
                        placeholder="Enter your MySQL password"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Database Name</label>
                      <input
                        type="text"
                        value={dbConfig.database}
                        onChange={e => setDbConfig({ ...dbConfig, database: e.target.value })}
                        placeholder="bloodconnect_db"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}

                {/* SSL / TLS Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="db-ssl-toggle"
                      checked={dbConfig.ssl}
                      onChange={e => setDbConfig({ ...dbConfig, ssl: e.target.checked })}
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="db-ssl-toggle" className="text-xs font-semibold text-slate-800 cursor-pointer">
                      Enable SSL / TLS Encryption
                    </label>
                  </div>
                  <span className="text-[11px] text-slate-500">Required for cloud MySQL (Aiven, AWS RDS)</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={testing}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                      <span>{testing ? 'Testing Connection...' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDbConfig({
                          host: 'localhost',
                          port: '3306',
                          user: 'root',
                          password: '',
                          database: 'bloodconnect_db',
                          ssl: false,
                          uri: '',
                        });
                        setRawUri('');
                      }}
                      className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                    >
                      Reset to Default
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleInitTables}
                      disabled={initializing}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Layers className={`w-3.5 h-3.5 ${initializing ? 'animate-spin' : ''}`} />
                      <span>{initializing ? 'Creating Tables...' : 'Execute CREATE TABLES'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSeedData}
                      disabled={seeding}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Database className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
                      <span>{seeding ? 'Seeding Data...' : 'Seed Sample Records'}</span>
                    </button>
                  </div>
                </div>

                {initResult && (
                  <div className={`p-3.5 rounded-xl text-xs font-bold border ${
                    initResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-rose-50 text-rose-800 border-rose-300'
                  }`}>
                    {initResult.message}
                  </div>
                )}
              </form>
            </div>
          )}

          {activeTab === 'laptop' && (
            <div className="space-y-5 text-xs">
              {/* Cloud Architecture Notice */}
              <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200 text-purple-950 flex items-start gap-3">
                <Info className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-purple-900">Why a Bridge is Needed for Laptop MySQL</h4>
                  <p className="text-purple-800 leading-relaxed">
                    This live web preview is running in a <strong>Google Cloud Run container</strong>. If you specify <code className="font-mono font-bold bg-purple-100 px-1 py-0.5 rounded">localhost:3306</code>, the container attempts to connect to itself rather than your physical laptop. To connect directly with your laptop's MySQL, pick either <strong>Method 1 (Tunnel in 60 seconds)</strong> or <strong>Method 2 (Run Locally)</strong> below.
                  </p>
                </div>
              </div>

              {/* METHOD 1: 60-Second Ngrok Tunnel */}
              <div className="p-5 rounded-2xl border-2 border-purple-300 bg-white shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center">1</span>
                    <h4 className="font-extrabold text-slate-900 text-sm">Method 1: 60-Second Cloud-to-Laptop Tunnel (Fastest)</h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    Zero Code Download
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed">
                  Expose your laptop&apos;s MySQL port <code className="font-mono font-bold text-purple-700">3306</code> to this cloud preview with a single temporary tunnel command:
                </p>

                {/* Step 1: Terminal Command */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-700 font-semibold">
                    <span>Step 1: Run this in Terminal (macOS/Linux) or Command Prompt / PowerShell (Windows):</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('npx ngrok tcp 3306', 'ngrok-cmd')}
                      className="text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal cursor-pointer"
                    >
                      {copied === 'ngrok-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy Command</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs flex items-center justify-between">
                    <span>npx ngrok tcp 3306</span>
                    <span className="text-[10px] text-slate-400 font-sans">No install required (runs via NPX)</span>
                  </div>
                </div>

                {/* Step 2: Explanation */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 space-y-1">
                  <span className="font-bold text-slate-800 block">Step 2: Ngrok will display output like this:</span>
                  <div className="font-mono text-[11px] text-slate-700 bg-white p-2 rounded border border-slate-200">
                    Forwarding <strong className="text-purple-700">tcp://0.tcp.in.ngrok.io:19423</strong> -&gt; localhost:3306
                  </div>
                </div>

                {/* Step 3: Paste and Auto-Connect */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-800">
                    Step 3: Paste your Ngrok Forwarding Address here:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={laptopTunnelInput}
                      onChange={e => handleLaptopTunnelInputChange(e.target.value)}
                      placeholder="e.g. tcp://0.tcp.in.ngrok.io:19423 or 4.tcp.ngrok.io:12345"
                      className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-slate-50/50"
                    />
                    <button
                      type="button"
                      onClick={handleConnectLaptopTunnel}
                      disabled={!parsedTunnel || laptopConnecting}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Zap className={`w-4 h-4 ${laptopConnecting ? 'animate-spin' : ''}`} />
                      <span>{laptopConnecting ? 'Connecting & Verifying...' : 'Connect to Laptop MySQL'}</span>
                    </button>
                  </div>

                  {parsedTunnel && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Detected Host: <strong>{parsedTunnel.host}</strong> | Port: <strong>{parsedTunnel.port}</strong></span>
                      </div>
                      <span className="text-emerald-700 font-sans font-semibold">User: root &bull; DB: bloodconnect_db</span>
                    </div>
                  )}
                </div>
              </div>

              {/* METHOD 2: Run Full App on Laptop */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-black text-xs flex items-center justify-center">2</span>
                    <h4 className="font-extrabold text-slate-900 text-sm">Method 2: Run App Directly on Laptop (Native Localhost)</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                    No Tunnel Needed
                  </span>
                </div>

                <p className="text-slate-600 leading-relaxed">
                  Run the full React + Express project on your laptop so both the backend and MySQL run on the same machine:
                </p>

                <ol className="list-decimal list-inside space-y-2 text-slate-600">
                  <li>
                    In AI Studio, click the top-right <strong>Settings / Export</strong> menu &gt; <strong>Export to GitHub</strong> or <strong>Download ZIP</strong>.
                  </li>
                  <li>
                    Extract the folder on your laptop, open Terminal / Command Prompt inside the folder, and run:
                  </li>
                </ol>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Laptop Terminal Command:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('npm install\nnpm run dev', 'local-run')}
                      className="text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal cursor-pointer"
                    >
                      {copied === 'local-run' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs whitespace-pre">
{`npm install
npm run dev`}
                  </div>
                </div>

                <p className="text-slate-600 text-[11px]">
                  Open <code className="font-mono text-purple-700 font-bold">http://localhost:3000</code> in your laptop&apos;s browser. The backend will connect directly to your local MySQL at <code className="font-mono text-purple-700">localhost:3306</code> with zero tunnels!
                </p>
              </div>

              {/* Troubleshooting: MySQL Laptop User Privileges */}
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-amber-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>Fixing &quot;Access Denied&quot; or &quot;Host Not Privileged&quot; in MySQL on Laptop</span>
                  </h5>
                  <button
                    type="button"
                    onClick={() => handleCopy(`CREATE DATABASE IF NOT EXISTS bloodconnect_db;
CREATE USER IF NOT EXISTS 'bloodconnect_app'@'%' IDENTIFIED BY '<YOUR_STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON bloodconnect_db.* TO 'bloodconnect_app'@'%';
FLUSH PRIVILEGES;`, 'sql-privs')}
                    className="text-amber-800 hover:text-amber-950 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    {copied === 'sql-privs' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy SQL Fix</span>
                  </button>
                </div>
                <p className="text-amber-900 text-[11px] leading-relaxed">
                  By default, local MySQL may only permit connections from <code className="font-mono">localhost</code>. Run this snippet once in MySQL Workbench or MySQL CLI to grant access:
                </p>
                <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] whitespace-pre overflow-x-auto">
{`CREATE DATABASE IF NOT EXISTS bloodconnect_db;
CREATE USER IF NOT EXISTS 'bloodconnect_app'@'%' IDENTIFIED BY '<YOUR_STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON bloodconnect_db.* TO 'bloodconnect_app'@'%';
FLUSH PRIVILEGES;`}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Relational Database Tables (InnoDB)</h4>
                  <p className="text-xs text-slate-500">9 normalized relational tables designed for MySQL 8.0 InnoDB.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadSchema}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>schema.sql</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: 'bloodconnect_db', desc: 'Main Database (UTF8MB4 Unicode General CI)' },
                  { name: 'donors', desc: 'Registered donors with blood group, city & eligibility' },
                  { name: 'blood_units', desc: 'Serialized inventory units with cold-chain temps' },
                  { name: 'blood_requests', desc: 'Hospital and emergency trauma requisition orders' },
                  { name: 'medical_screenings', desc: 'Hemoglobin, blood pressure, weight & vitals log' },
                  { name: 'blood_groups', desc: 'Universal donor/recipient compatibility lookup' },
                  { name: 'donation_camps', desc: 'Outreach drives, venues, registered slots' },
                  { name: 'users', desc: 'RBAC accounts (admin, staff, hospital, donor)' },
                  { name: 'audit_logs', desc: 'Immutable transaction trails and security actions' }
                ].map(tbl => (
                  <div key={tbl.name} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-purple-700">{tbl.name}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">InnoDB</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{tbl.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs text-purple-900">
                  <span className="font-bold block">One-Click DDL Execution</span>
                  <span>Create database and all tables automatically with triggers, indexes, and initial data.</span>
                </div>
                <button
                  onClick={handleInitTables}
                  disabled={initializing}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 transition-colors cursor-pointer"
                >
                  {initializing ? 'Executing...' : 'Run Auto-Setup'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'query_console' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Interactive SQL Console</h4>
                  <p className="text-xs text-slate-500">Run direct SQL commands against MySQL.</p>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  MySQL 8.0 Engine
                </span>
              </div>

              {/* Preset SQL queries */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-bold text-slate-600 mr-1">Quick Queries:</span>
                {[
                  { label: 'Blood Groups', sql: 'SELECT * FROM blood_groups;' },
                  { label: 'Donors', sql: 'SELECT donor_code, full_name, blood_group, city, weight_kg FROM donors LIMIT 5;' },
                  { label: 'Inventory Units', sql: 'SELECT unit_code, blood_group, component_type, temperature_c, status FROM blood_units LIMIT 5;' },
                  { label: 'Blood Requests', sql: 'SELECT request_code, hospital_name, patient_name, blood_group, urgency FROM blood_requests LIMIT 5;' },
                  { label: 'Audit Logs', sql: 'SELECT log_id, action, table_name, timestamp FROM audit_logs LIMIT 5;' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setSqlQuery(item.sql)}
                    className="px-2.5 py-1 text-[11px] font-mono font-semibold rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 border border-slate-200 transition-colors cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* SQL Input Area */}
              <div className="relative">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  rows={4}
                  placeholder="Enter SQL statement, e.g. SELECT * FROM blood_groups;"
                  className="w-full p-3 font-mono text-xs text-slate-900 bg-slate-900 text-emerald-300 rounded-xl border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleRunQuery}
                  disabled={queryRunning || !sqlQuery.trim()}
                  className="absolute bottom-3 right-3 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className={`w-3 h-3 ${queryRunning ? 'animate-spin' : ''}`} />
                  <span>{queryRunning ? 'Running...' : 'Run SQL'}</span>
                </button>
              </div>

              {/* Query Result View */}
              {queryResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold ${queryResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {queryResult.message}
                    </span>
                    {queryResult.durationMs !== undefined && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        Latency: {queryResult.durationMs}ms
                      </span>
                    )}
                  </div>

                  {queryResult.rows && queryResult.rows.length > 0 && queryResult.fields && (
                    <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-60 bg-white">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                          <tr>
                            {queryResult.fields.map(f => (
                              <th key={f} className="p-2 font-bold whitespace-nowrap">{f}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              {queryResult.fields!.map(f => (
                                <td key={f} className="p-2 whitespace-nowrap text-[11px]">
                                  {typeof row[f] === 'object' && row[f] !== null
                                    ? JSON.stringify(row[f])
                                    : String(row[f] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'setup_guides' && (
            <div className="space-y-4 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Step-by-Step Setup Instructions</h4>

              {/* Option 1: XAMPP / WAMP / Local MySQL */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Option 1: Local MySQL / XAMPP / WAMP</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">Recommended for Local Dev</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed">
                  <li>Start the <strong>MySQL service</strong> in XAMPP, Homebrew, or Windows Services.</li>
                  <li>Set <code className="font-mono text-purple-700">DB_USER</code> and <code className="font-mono text-purple-700">DB_PASSWORD</code> in your <code className="font-mono text-purple-700">.env</code> file (or enter them in the Connection form).</li>
                  <li>Click <strong>Test Connection</strong>, then click <strong>CREATE DATABASE &amp; TABLES</strong>.</li>
                </ol>
              </div>

              {/* Option 2: Docker One-Liner */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Option 2: Instant Docker Container (Zero Install)</span>
                  <button
                    onClick={() => handleCopy('docker run -d --name mysql-blood -p 3306:3306 -e MYSQL_ROOT_PASSWORD=<YOUR_PASSWORD> -e MYSQL_DATABASE=bloodconnect_db mysql:8', 'docker')}
                    className="text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal cursor-pointer"
                  >
                    {copied === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Command</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
                  docker run -d --name mysql-blood -p 3306:3306 -e MYSQL_ROOT_PASSWORD=&lt;YOUR_PASSWORD&gt; -e MYSQL_DATABASE=bloodconnect_db mysql:8
                </div>
              </div>

              {/* Option 3: MySQL Terminal CLI */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Option 3: MySQL Terminal Command Line</span>
                  <button
                    onClick={() => handleCopy('mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS bloodconnect_db;"\nmysql -u root -p bloodconnect_db < bloodconnect_schema.sql', 'cli')}
                    className="text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal cursor-pointer"
                  >
                    {copied === 'cli' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Commands</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] whitespace-pre overflow-x-auto">
{`mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS bloodconnect_db;"
mysql -u root -p bloodconnect_db < bloodconnect_schema.sql`}
                </div>
              </div>

              {/* Option 4: Cloud-Hosted MySQL */}
              <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50/50 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Option 4: Cloud-Hosted MySQL (Aiven, PlanetScale, Railway, AWS RDS)</span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">Cloud &amp; Production</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed">
                  <li>Provision a free MySQL database on <strong>Aiven.io</strong> or <strong>Railway.app</strong>.</li>
                  <li>Copy your <strong>Service URI</strong>.</li>
                  <li>In the <strong>Connection</strong> tab, select <strong>Connection URI</strong> mode and paste it.</li>
                  <li>Click <strong>Test Connection</strong>, then click <strong>CREATE DATABASE &amp; TABLES</strong>.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Resilient Architecture: The application automatically synchronizes data and runs smoothly in both live MySQL and local memory modes.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
