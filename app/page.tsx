"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon,
  XCircle, ScanLine, Edit2, MapPin, AlertTriangle, MessageSquareWarning, 
  Download, FileText, Info, Trash2, ArrowDownLeft, ArrowUpRight, Receipt,
  ChevronRight
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut, updateProfile
} from "firebase/auth";

import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, 
  onSnapshot, updateDoc, increment, serverTimestamp, query, where, getDocs, deleteDoc
} from "firebase/firestore";

/* ==================== TYPES ==================== */
interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
  isRejected?: boolean;
  storeName?: string;
  location?: string;
}

interface PurchaseSlip {
  id: string;
  studentUid: string;
  numSets: number;
  totalAmount: number;
  slipUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Redemption {
  id: string;
  studentUid: string;
  merchantId: string;
  amount: number;
  redeemedAt: string;
}

interface AppSettings {
  pricePerSet: number;
  promptPayQr: string | null;
}

interface ReportIssue {
  id: string;
  studentUid: string;
  email: string;
  issue: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

/* ==================== CONSTANTS ==================== */
const ADMIN_EMAIL = "admin@mfupass.com";

/* ==================== FIREBASE CONFIG ==================== */
const getFirebaseConfig = () => ({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
});

/* ==================== MAIN APP ==================== */
export default function MFUPassApp() {
  const [user, setUser] = useState<any>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_setup'>('login');
  const [currentView, setCurrentView] = useState<string>('auth');

  const [userData, setUserData] = useState<UserData | null>(null);
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  
  // States: Student/Guest History
  const [myPurchases, setMyPurchases] = useState<PurchaseSlip[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<Redemption[]>([]);

  // States: Admin
  const [allPendingSlips, setAllPendingSlips] = useState<PurchaseSlip[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [allPasses, setAllPasses] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<ReportIssue[]>([]);
  const [allRedemptions, setAllRedemptions] = useState<Redemption[]>([]);
  
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [systemSettings, setSystemSettings] = useState<AppSettings>({ pricePerSet: 79, promptPayQr: null });

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Firebase Auth
  useEffect(() => {
    const config = getFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL) {
          const adminSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (adminSnap.exists()) setUserData(adminSnap.data() as UserData);
          setCurrentView('admin');
        } else {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists()) {
            const data = userSnap.data() as UserData;
            setUserData(data);
            setCurrentView(data.role);
          } else {
            setAuthMode('role_setup');
            setCurrentView('auth');
          }
        }
      } else {
        setCurrentView('auth');
        setAuthMode('login');
        setUserData(null);
      }
      setIsAppReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Listeners
  useEffect(() => {
    if (!user || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
    }));

    if (['student', 'guest'].includes(currentView) || currentView === 'buy_pass' || currentView === 'scan_qr') {
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        const myPass = snap.docs.find((d: any) => d.data().studentUid === user.uid);
        setActivePass(myPass ? { id: myPass.id, ...myPass.data() } : null);
      }));

      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        const purchases = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip));
        setMyPurchases(purchases);
        const pending = purchases.find(p => p.status === 'pending');
        setPendingPurchase(pending || null);
      }));

      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        const reds = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        setMyRedemptions(reds);
      }));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        filtered.sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());
        setRedemptions(filtered);
      }));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserData)));
      }));
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        setAllPasses(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      }));
      unsubs.push(onSnapshot(collection(db, 'reports'), (snap) => {
        const reports = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as ReportIssue));
        reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllReports(reports);
      }));
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setAllRedemptions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Redemption)));
      }));
    }

    unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserData);
    }));

    return () => unsubs.forEach(unsub => unsub());
  }, [user, currentView]);

  const handleAuthAction = async (email: string, pass: string, displayName?: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        if (displayName) {
          await updateProfile(userCred.user, { displayName });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e: any) {
      let msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      if (e.code === 'auth/email-already-in-use') msg = "อีเมลนี้มีผู้ใช้งานแล้ว";
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') msg = "ไม่พบบัญชีผู้ใช้ หรือรหัสผ่านผิด";
      showToast(msg, "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = () => signOut(getAuth());

  const handleRoleSelect = async (role: string, extraData: any = {}) => {
    if (!user) return;
    setIsActionLoading(true);
    const db = getFirestore();
    const data = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role,
      isApproved: role !== 'merchant',
      createdAt: serverTimestamp(),
      ...extraData
    };
    await setDoc(doc(db, 'users', user.uid), data, { merge: true });
    setCurrentView(role);
    setIsActionLoading(false);
  };

  const handleEditName = async () => {
    const newName = prompt("ตั้งชื่อผู้ใช้งาน (Display Name) ใหม่:", userData?.displayName || "");
    if (newName && newName.trim() !== "") {
      const db = getFirestore();
      await updateDoc(doc(db, 'users', user.uid), { displayName: newName.trim() });
      showToast("อัปเดตชื่อผู้ใช้งานสำเร็จ", "success");
    }
  };

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center">
        <Ticket className="w-12 h-12 animate-pulse text-indigo-600 mb-4" />
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="relative bg-[#F9FAFB] min-h-screen font-sans text-slate-800">
      {/* Minimal Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-6 fade-in w-max">
          <div className={`px-5 py-3 rounded-full font-bold text-white shadow-lg flex items-center justify-center gap-2 text-sm
            ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-blue-500' : 'bg-slate-900'}`}>
            {toast.type === 'error' && <XCircle size={16} />}
            {toast.type === 'success' && <CheckCircle size={16} />}
            {toast.type === 'info' && <Info size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto bg-white min-h-screen shadow-[0_0_40px_rgba(0,0,0,0.05)] relative overflow-x-hidden">
        {currentView === 'auth' && <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} showToast={showToast} />}
        
        {currentView === 'admin' && <AdminDashboardView 
          allPendingSlips={allPendingSlips} 
          allUsers={allUsers} 
          allPasses={allPasses}
          allReports={allReports}
          allRedemptions={allRedemptions}
          systemSettings={systemSettings} 
          onLogout={handleLogout} 
          showToast={showToast} 
          user={user} 
          userData={userData} 
          onEditName={handleEditName} 
          setIsActionLoading={setIsActionLoading}
          isActionLoading={isActionLoading}
        />}
        
        {(currentView === 'student' || currentView === 'guest') && <StudentDashboardView user={user} userData={userData} activePass={activePass} pendingPurchase={pendingPurchase} myPurchases={myPurchases} myRedemptions={myRedemptions} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} showToast={showToast} onEditName={handleEditName} />}
        
        {currentView === 'merchant' && <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} onLogout={handleLogout} showToast={showToast} onEditName={handleEditName} />}
        
        {currentView === 'buy_pass' && <BuyPassView settings={systemSettings} onBack={() => setCurrentView(userData?.role || 'student')} user={user} showToast={showToast} />}
        
        {currentView === 'scan_qr' && <ScanQRView onBack={() => setCurrentView(userData?.role || 'student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} showToast={showToast} />}
        
        {currentView === 'success' && <SuccessView onDone={() => setCurrentView(userData?.role || 'student')} />}
      </div>
    </div>
  );
}

/* ==================== SUB COMPONENTS (Minimalist UI) ==================== */

function Header({ title, subtitle, onLogout, user, userData, showToast, onEditName }: any) {
  return (
    <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-100 flex justify-between items-center sticky top-0 z-40">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-slate-500 text-xs font-medium truncate max-w-[150px]">
            {userData?.displayName || subtitle}
          </p>
          {onEditName && (
            <button onClick={onEditName} className="text-slate-400 hover:text-indigo-600 transition-colors active:scale-90">
              <Edit2 size={12} />
            </button>
          )}
        </div>
      </div>
      {onLogout && (
        <button onClick={onLogout} className="bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-600 px-4 py-2.5 rounded-full font-bold text-xs transition-all active:scale-95 flex items-center gap-2">
          Logout
        </button>
      )}
    </div>
  );
}

/* Auth Screen - Clean Form */
function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading, showToast }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Merchant Setup States
  const [isMerchantSetup, setIsMerchantSetup] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || !email.includes(".")) return showToast("รูปแบบอีเมลไม่ถูกต้อง", "error");
    if (password.length < 6) return showToast("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "error");
    if (authMode === 'register' && !displayName.trim()) return showToast("กรุณากรอกชื่อผู้ใช้งาน", "error");
    onAuth(email, password, displayName);
  };

  const handleMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !location.trim()) return showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
    if (!acceptedPolicy) return showToast("คุณต้องยอมรับเงื่อนไขการเป็นพาร์ทเนอร์ก่อน", "error");
    onRoleSelect('merchant', { storeName, location });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-white">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        
        {!isMerchantSetup && (
          <div className="flex flex-col items-center mb-12">
            <div className="w-16 h-16 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center shadow-lg shadow-indigo-200 mb-4">
              <Ticket size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">MFU Pass</h1>
            <p className="text-slate-400 text-xs font-medium mt-1">Sign in to your wallet</p>
          </div>
        )}

        {authMode === 'role_setup' ? (
          !isMerchantSetup ? (
            <div className="space-y-3 animate-in slide-in-from-bottom-4">
              <p className="text-center text-slate-500 font-bold text-xs mb-4">Select your role to continue</p>
              <RoleButton icon={<User size={20}/>} title="Student" onClick={() => onRoleSelect('student')} />
              <RoleButton icon={<Users size={20}/>} title="Guest" onClick={() => onRoleSelect('guest')} />
              <RoleButton icon={<Store size={20}/>} title="Merchant" onClick={() => setIsMerchantSetup(true)} />
            </div>
          ) : (
            <form onSubmit={handleMerchantSubmit} className="space-y-5 animate-in slide-in-from-right-4">
              <div className="text-center mb-6">
                <Store size={32} className="text-slate-800 mx-auto mb-3" />
                <h2 className="text-xl font-black text-slate-800">Merchant Partner</h2>
                <p className="text-xs text-slate-500 mt-1">Register your store</p>
              </div>

              <div className="space-y-3">
                <input type="text" placeholder="Store Name" value={storeName} onChange={(e: any) => setStoreName(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800 text-sm" required />
                <input type="text" placeholder="Location / Zone" value={location} onChange={(e: any) => setLocation(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800 text-sm" required />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800 block mb-1">Terms of Service</span>
                  By proceeding, you agree to provide truthful information. Fraudulent activities will result in immediate account termination and possible legal action.
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer px-1">
                <input type="checkbox" checked={acceptedPolicy} onChange={(e) => setAcceptedPolicy(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700">I accept the terms and conditions</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsMerchantSetup(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-50 text-sm">Cancel</button>
                <button type="submit" className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 active:scale-95 text-sm">Submit Request</button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'register' && (
              <input type="text" placeholder="Display Name" value={displayName} onChange={(e: any) => setDisplayName(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
            )}

            <input type="email" placeholder="Email Address" value={email} onChange={(e: any) => setEmail(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
            
            <div className="relative">
              <input type={showPassword ? "text" : "password"} placeholder="Password (Min 6 chars)" value={password} onChange={(e: any) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>

            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl text-base active:scale-95 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70">
              {isActionLoading ? <Loader2 className="animate-spin" size={20} /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>

            <div className="text-center pt-4">
              <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-slate-500 text-sm font-medium hover:text-indigo-600">
                {authMode === 'login' ? 'New here? Sign up' : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white border border-slate-200 hover:border-indigo-500 p-4 rounded-2xl flex items-center gap-4 active:scale-95 transition-all group">
      <div className="text-slate-400 group-hover:text-indigo-600 transition-colors">{icon}</div>
      <div className="font-bold text-slate-700">{title}</div>
      <ChevronRight size={18} className="ml-auto text-slate-300 group-hover:text-indigo-500" />
    </button>
  );
}

/* ==================== ADMIN DASHBOARD ==================== */
function AdminDashboardView({ allPendingSlips, allUsers, allPasses, allReports, allRedemptions, systemSettings, onLogout, showToast, user, userData, onEditName, setIsActionLoading, isActionLoading }: any) {
  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const [promptPayQr, setPromptPayQr] = useState(systemSettings.promptPayQr || "");
  const [adminTab, setAdminTab] = useState<'overview' | 'slips' | 'users' | 'history' | 'settings'>('overview');
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: any) => s.status === 'pending');
  const approvedSlips = allPendingSlips.filter((s: any) => s.status === 'approved');
  const pendingMerchants = allUsers.filter((u: UserData) => u.role === 'merchant' && !u.isApproved && !u.isRejected);
  const pendingReports = allReports.filter((r: ReportIssue) => r.status === 'pending');

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'global'), { pricePerSet: Number(pricePerSet), promptPayQr }, { merge: true });
    showToast("บันทึกการตั้งค่าสำเร็จ", "success");
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return showToast('กรุณาอัปโหลดรูปภาพ', 'error');
      const reader = new FileReader();
      reader.onloadend = () => setPromptPayQr(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleApproveSlip = async (slip: PurchaseSlip) => {
    try {
      const passQuery = query(collection(db, 'passes'), where('studentUid', '==', slip.studentUid));
      const passDocs = await getDocs(passQuery);
      const addedCoupons = 5 * slip.numSets;

      if (!passDocs.empty) {
        await updateDoc(passDocs.docs[0].ref, { remainingCoupons: increment(addedCoupons) });
      } else {
        await addDoc(collection(db, 'passes'), { studentUid: slip.studentUid, remainingCoupons: addedCoupons });
      }
      await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
      showToast("อนุมัติแล้ว", "success");
    } catch(err) { showToast("เกิดข้อผิดพลาด", "error"); }
  };

  // SYSTEM RESET FUNCTION WITH PASSCODE
  const handleSystemReset = async () => {
    const confirmReset = window.confirm("⚠️ คำเตือน: คุณแน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมดในระบบ? (ผู้ใช้ทุกคนต้องสมัครใหม่ ข้อมูลคูปองจะหายทั้งหมด การกระทำนี้ไม่สามารถย้อนกลับได้)");
    if (!confirmReset) return;

    const passCode = window.prompt("กรุณากรอกรหัสยืนยันการรีเซ็ตระบบ (6 หลัก):");
    if (passCode !== "842019") {
      showToast("รหัสยืนยันไม่ถูกต้อง ยกเลิกการทำรายการ", "error");
      return;
    }

    setIsActionLoading(true);
    try {
      // Helper function to delete all docs in a collection
      const clearCollection = async (colName: string) => {
        const snap = await getDocs(collection(db, colName));
        const promises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(promises);
      };

      // 1. Clear standard collections
      await clearCollection('passes');
      await clearCollection('purchases');
      await clearCollection('redemptions');
      await clearCollection('reports');

      // 2. Clear users EXCEPT ADMIN
      const usersSnap = await getDocs(collection(db, 'users'));
      const userDeletePromises = usersSnap.docs.map(d => {
        if (d.data().email !== ADMIN_EMAIL) {
          return deleteDoc(d.ref);
        }
        return Promise.resolve();
      });
      await Promise.all(userDeletePromises);

      showToast("รีเซ็ตระบบเรียบร้อยแล้ว ทุกคนต้องสมัครใหม่", "success");
    } catch (error) {
      showToast("เกิดข้อผิดพลาดในการรีเซ็ตระบบ", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Combine History
  const globalHistory = [
    ...allPendingSlips.map((s: PurchaseSlip) => ({ ...s, type: 'purchase' as const, date: new Date(s.createdAt) })),
    ...allRedemptions.map((r: Redemption) => ({ ...r, type: 'redemption' as const, date: new Date(r.redeemedAt) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header title="Admin" subtitle="Management" onLogout={onLogout} user={user} userData={userData} onEditName={onEditName} />
      
      {/* Custom Tabs */}
      <div className="px-6 pt-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide bg-white border-b border-slate-100 shrink-0">
        <TabButton active={adminTab==='overview'} onClick={()=>setAdminTab('overview')} label="Overview" />
        <TabButton active={adminTab==='slips'} onClick={()=>setAdminTab('slips')} label={`Slips (${pendingSlips.length})`} />
        <TabButton active={adminTab==='users'} onClick={()=>setAdminTab('users')} label="Users" />
        <TabButton active={adminTab==='history'} onClick={()=>setAdminTab('history')} label="History" />
        <TabButton active={adminTab==='settings'} onClick={()=>setAdminTab('settings')} label="Settings" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {adminTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Pending Slips</p>
                <p className="text-3xl font-black text-amber-500">{pendingSlips.length}</p>
              </div>
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">New Merchants</p>
                <p className="text-3xl font-black text-blue-500">{pendingMerchants.length}</p>
              </div>
            </div>

            {/* Reports Section */}
            <div>
              <h3 className="font-bold text-slate-800 mb-3 text-sm">User Reports ({pendingReports.length})</h3>
              {pendingReports.length === 0 ? <p className="text-xs text-slate-400">No issues reported.</p> : pendingReports.map((r: ReportIssue) => (
                <div key={r.id} className="bg-red-50 p-5 rounded-3xl mb-3 border border-red-100">
                  <p className="text-sm text-red-900 font-medium mb-2">"{r.issue}"</p>
                  <p className="text-[10px] text-red-500 font-mono mb-4">{r.email}</p>
                  <button onClick={() => { updateDoc(doc(db, 'reports', r.id), { status: 'resolved' }); showToast("Resolved", "success"); }} 
                    className="w-full bg-white text-red-600 font-bold py-3 rounded-xl text-xs hover:bg-red-50 shadow-sm border border-red-100">
                    Mark as Resolved
                  </button>
                </div>
              ))}
            </div>

            {/* Merchant Approvals */}
            <div>
              <h3 className="font-bold text-slate-800 mb-3 text-sm">Merchant Approvals</h3>
              {pendingMerchants.length === 0 ? <p className="text-xs text-slate-400">No pending merchants.</p> : pendingMerchants.map((m: any) => (
                <div key={m.uid} className="bg-white p-5 rounded-3xl mb-3 border border-slate-100 shadow-sm">
                  <p className="font-bold text-slate-800">{m.storeName}</p>
                  <p className="text-xs text-slate-500 mb-3">{m.location} • {m.email}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isApproved: true })} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-xs">Approve</button>
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isRejected: true })} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-xs">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === 'slips' && (
          <div className="space-y-4 animate-in fade-in">
            {pendingSlips.length === 0 ? <p className="text-slate-500 text-sm text-center py-10">No pending slips.</p> : pendingSlips.map((slip: PurchaseSlip) => (
              <div key={slip.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-mono text-slate-400 text-xs">{slip.studentUid.slice(0,8)}</span>
                  <span className="font-bold text-indigo-600 text-sm">{slip.numSets} Sets ({slip.totalAmount}฿)</span>
                </div>
                <img src={slip.slipUrl} className="w-full rounded-2xl mb-4 bg-slate-50" alt="slip" />
                <div className="flex gap-2">
                  <button onClick={() => handleApproveSlip(slip)} className="flex-1 bg-green-500 text-white py-3 rounded-xl font-bold text-sm active:scale-95">Approve</button>
                  <button onClick={() => { updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' }); showToast("Rejected", "info"); }} className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold text-sm active:scale-95">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'users' && (
          <div className="space-y-3 animate-in fade-in">
            {allUsers.map((u: any) => {
              if (u.email === ADMIN_EMAIL) return null;
              const pass = allPasses.find((p: any) => p.studentUid === u.uid);
              return (
                <div key={u.uid} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex justify-between items-center">
                  <div className="truncate pr-2">
                    <p className="font-bold text-sm text-slate-800 truncate">{u.displayName || u.email}</p>
                    <p className="text-[10px] text-slate-400 uppercase mt-0.5">{u.role} {u.role === 'merchant' ? (u.isApproved ? '(Active)' : '(Pending)') : ''}</p>
                  </div>
                  {['student', 'guest'].includes(u.role) && (
                    <button 
                      onClick={() => {
                        const newAm = prompt("Edit Coupons:", pass?.remainingCoupons || "0");
                        if(newAm !== null && !isNaN(parseInt(newAm))) {
                          if (pass?.id) updateDoc(doc(db, 'passes', pass.id), { remainingCoupons: parseInt(newAm) });
                          else addDoc(collection(db, 'passes'), { studentUid: u.uid, remainingCoupons: parseInt(newAm) });
                        }
                      }}
                      className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100"
                    >
                      {pass?.remainingCoupons || 0} CPN
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {adminTab === 'history' && (
          <div className="space-y-3 animate-in fade-in">
            {globalHistory.length === 0 ? <p className="text-slate-500 text-sm text-center py-10">No history yet.</p> : globalHistory.map((h: any, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${h.type === 'purchase' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                    {h.type === 'purchase' ? <Upload size={16} /> : <ScanLine size={16} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">{h.type === 'purchase' ? 'Purchase Pass' : 'Redemption'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{h.studentUid.slice(0,8)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${h.status === 'rejected' ? 'text-red-500' : 'text-slate-800'}`}>
                    {h.type === 'purchase' ? `${h.totalAmount} ฿` : '-1 CPN'}
                  </p>
                  <p className="text-[10px] text-slate-400">{h.date.toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in pb-10">
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Payment Setup</h3>
              <div className="mb-4">
                <p className="text-slate-500 text-xs font-bold mb-2">Price per Set (5 Coupons)</p>
                <input type="number" value={pricePerSet} onChange={(e: any) => setPricePerSet(e.target.value)} 
                  className="w-full bg-slate-50 text-xl font-bold rounded-2xl p-4 outline-none border border-slate-200 focus:border-indigo-500" />
              </div>
              <div className="mb-6">
                <p className="text-slate-500 text-xs font-bold mb-2">PromptPay QR Code</p>
                <label className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-center cursor-pointer mb-3">
                  <span className="text-indigo-600 font-bold text-sm flex items-center gap-2"><Upload size={16}/> Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                </label>
                <textarea value={promptPayQr} onChange={(e: any) => setPromptPayQr(e.target.value)} rows={2}
                  className="w-full bg-slate-50 rounded-2xl p-4 text-xs font-mono outline-none resize-none border border-slate-200" placeholder="Or paste Image URL..." />
                {promptPayQr && <img src={promptPayQr} className="mt-3 max-h-40 mx-auto rounded-xl" alt="QR Preview" />}
              </div>
              <button onClick={saveSettings} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95 transition-all">Save Settings</button>
            </div>

            {/* DANGER ZONE */}
            <div className="bg-red-50 rounded-3xl p-6 border border-red-100 text-center">
              <AlertTriangle className="text-red-500 mx-auto mb-3" size={32} />
              <h3 className="font-bold text-red-800 mb-2">Danger Zone</h3>
              <p className="text-xs text-red-600/80 mb-6">Resetting the system will delete all passes, slips, histories, and users (except admin). Everyone will need to re-register.</p>
              <button onClick={handleSystemReset} disabled={isActionLoading} className="w-full bg-white border border-red-200 text-red-600 font-bold py-4 rounded-2xl active:scale-95 flex items-center justify-center gap-2">
                {isActionLoading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />} System Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: any) {
  return (
    <button onClick={onClick} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${active ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
      {label}
    </button>
  );
}

/* ==================== STUDENT DASHBOARD ==================== */
function StudentDashboardView({ user, userData, activePass, pendingPurchase, myPurchases, myRedemptions, onLogout, onBuyPass, onScan, showToast, onEditName }: any) {
  
  const handleReport = async () => {
    const issue = prompt("Describe your issue or suggestion:");
    if(issue && issue.trim() !== "") {
      try {
        await addDoc(collection(getFirestore(), 'reports'), {
          studentUid: user.uid, email: user.email, issue: issue.trim(), status: 'pending', createdAt: new Date().toISOString()
        });
        showToast("Report submitted to Admin.", "success");
      } catch (e) { showToast("Failed to submit.", "error"); }
    }
  };

  // Combine History
  const history = [
    ...(myPurchases || []).map((p: any) => ({ ...p, type: 'purchase' as const, date: new Date(p.createdAt) })),
    ...(myRedemptions || []).map((r: any) => ({ ...r, type: 'redemption' as const, date: new Date(r.redeemedAt) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB]">
      <Header title="My Wallet" subtitle={userData?.role} user={user} userData={userData} onLogout={onLogout} onEditName={onEditName} showToast={showToast} color="indigo" />
      
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-12 space-y-6">
        
        {/* Pass Card */}
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.03)] flex flex-col items-center relative overflow-hidden animate-in zoom-in duration-500">
          <div className="absolute top-0 w-full h-2 bg-indigo-500"></div>
          
          {activePass && activePass.remainingCoupons > 0 ? (
            <div className="w-full text-center">
              <p className="uppercase text-[10px] font-black text-slate-400 tracking-widest mb-2">Available Coupons</p>
              <div className="text-[6rem] font-black leading-none text-slate-900 mb-2">{activePass.remainingCoupons}</div>
              <div className="bg-slate-50 text-indigo-600 font-bold py-2 px-4 rounded-full inline-flex items-center gap-2 mb-8 text-sm border border-slate-100">
                <Sparkles size={14}/> Total Value {activePass.remainingCoupons * 20} ฿
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={onScan} className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl text-lg active:scale-95 shadow-md flex items-center justify-center gap-2">
                  <QrCode size={18}/> Scan
                </button>
                <button onClick={onBuyPass} className="flex-none bg-slate-100 text-slate-700 font-bold px-5 rounded-2xl active:scale-95 hover:bg-slate-200 text-sm">
                  + Buy
                </button>
              </div>
            </div>
          ) : pendingPurchase ? (
            <div className="text-center py-8">
              <Clock size={48} className="mx-auto text-amber-400 mb-4 animate-pulse" />
              <h3 className="font-black text-xl text-slate-800 mb-2">Verification Pending</h3>
              <p className="text-slate-500 text-xs">Admin is reviewing your slip.</p>
            </div>
          ) : (
            <div className="text-center py-8 w-full">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100"><Ticket size={24} className="text-slate-400"/></div>
              <h3 className="font-black text-xl text-slate-800 mb-2">Wallet Empty</h3>
              <p className="text-slate-500 text-xs mb-8">Purchase a pass to get started.</p>
              <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl active:scale-95 shadow-md text-base">Buy Pass</button>
            </div>
          )}
        </div>

        {/* History Log */}
        <div>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="font-bold text-slate-800 text-sm">Recent Activity</h3>
            <button onClick={handleReport} className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1">Report Issue</button>
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-6 bg-white rounded-2xl border border-slate-100">No recent activity.</p>
            ) : history.slice(0,5).map((h: any, idx: number) => (
              <div key={idx} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${h.type === 'purchase' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
                    {h.type === 'purchase' ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">{h.type === 'purchase' ? 'Pass Added' : 'Redeemed'}</p>
                    <p className="text-[10px] text-slate-400">{h.date.toLocaleDateString()} {h.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>
                <p className={`font-black text-base ${h.type === 'purchase' ? 'text-indigo-600' : 'text-slate-800'}`}>
                  {h.type === 'purchase' ? `+${h.numSets * 5}` : '-1'}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ==================== MERCHANT DASHBOARD ==================== */
function MerchantDashboardView({ user, userData, redemptions, onLogout, showToast, onEditName }: any) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${user?.uid}&margin=10`;

  const downloadQR = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MFUPass_StoreQR_${userData?.storeName || 'Shop'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Downloaded", "success");
    } catch (e) {
      window.open(qrCodeUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans w-full pb-12">
      <Header title="Shop Center" subtitle={userData?.storeName || "Shop"} color="slate" onLogout={onLogout} user={user} userData={userData} showToast={showToast} onEditName={onEditName} />
      
      <div className="px-5 flex-1 max-w-md mx-auto w-full pt-6 space-y-6 animate-in slide-in-from-bottom-4">
        {!userData?.isApproved ? (
           <div className="bg-white text-center p-10 rounded-3xl border border-slate-200">
             <Clock className="mx-auto text-amber-500 mb-4 animate-pulse" size={48}/>
             <h3 className="text-xl font-black text-slate-800 mb-2">Pending Approval</h3>
             <p className="text-slate-500 text-xs">Please wait for admin verification.</p>
           </div>
        ) : (
          <>
            <div className="bg-white text-center p-8 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-2">Redeemed Today</p>
              <div className="text-7xl font-black text-slate-900 mb-6">{redemptions.length}</div>
              <div className="bg-slate-50 py-4 rounded-2xl border border-slate-100">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                <p className="text-2xl font-black text-slate-800">{redemptions.length * 20} ฿</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center text-center">
               <p className="text-slate-800 font-black text-sm mb-4">Store QR Code</p>
               <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 mb-4">
                 <img src={qrCodeUrl} className="w-40 h-40 object-contain rounded-xl" alt="Store QR" />
               </div>
               <button onClick={downloadQR} className="bg-slate-100 text-slate-700 font-bold py-3 px-6 rounded-xl flex items-center gap-2 hover:bg-slate-200 active:scale-95 text-xs">
                 <Download size={14} /> Download QR
               </button>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">History</h3>
              <div className="space-y-3">
                {redemptions.length === 0 ? <p className="text-xs text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-100">No transactions yet.</p> : redemptions.slice(0, 10).map((r: any, idx: number) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="bg-green-50 p-2 rounded-full text-green-600"><Receipt size={16}/></div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Coupon Received</p>
                        <p className="text-[10px] text-slate-400">{new Date(r.redeemedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                      </div>
                    </div>
                    <p className="font-black text-green-600 text-sm">+20 ฿</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ==================== BUY PASS VIEW ==================== */
function BuyPassView({ settings, onBack, user, showToast }: any) {
  const [numSets, setNumSets] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const totalAmount = Number(settings?.pricePerSet || 79) * numSets;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return showToast('Image files only.', 'error');
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6 font-sans flex flex-col max-w-md mx-auto w-full animate-in fade-in">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="p-2 bg-slate-50 rounded-full text-slate-500 hover:bg-slate-100"><ChevronLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900">Buy Pass</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 space-y-6">
        <div className="bg-slate-50 rounded-3xl p-6 text-center border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Select Sets (1 Set = 5 Coupons)</p>
          <div className="flex justify-center items-center gap-6 mb-6">
            <button onClick={() => setNumSets((n: number) => Math.max(1, n-1))} className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Minus size={20}/></button>
            <div className="text-5xl font-black text-slate-800 w-16">{numSets}</div>
            <button onClick={() => setNumSets((n: number) => n+1)} className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Plus size={20}/></button>
          </div>
          <div className="pt-4 border-t border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Payment</p>
            <p className="text-3xl font-black text-indigo-600">{totalAmount} ฿</p>
          </div>
        </div>

        {settings?.promptPayQr && (
          <div className="bg-slate-50 rounded-3xl p-6 text-center border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Scan to Pay</p>
            <img src={settings.promptPayQr} className="w-40 h-40 mx-auto rounded-2xl object-contain bg-white p-2 shadow-sm" alt="QR" />
          </div>
        )}

        <div>
          <label className="border-2 border-dashed border-slate-200 rounded-3xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all overflow-hidden bg-white">
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip" /> : (
              <div className="text-center"><Upload size={32} className="text-slate-300 mx-auto mb-2" /><p className="text-[10px] font-bold text-slate-400 uppercase">Upload Slip</p></div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>

      <button onClick={async () => {
          if (!slip) return showToast("Upload slip first", "error");
          setIsLoading(true);
          await addDoc(collection(getFirestore(), 'purchases'), { studentUid: user.uid, numSets, totalAmount, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
          setIsLoading(false);
          onBack();
      }} disabled={!slip || isLoading} className="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl text-lg mt-6 active:scale-95 disabled:opacity-50">
        {isLoading ? <Loader2 className="animate-spin mx-auto"/> : "Confirm Payment"}
      </button>
    </div>
  );
}

/* ==================== SCAN QR VIEW ==================== */
function ScanQRView({ onBack, activePass, user, onSuccess, showToast }: any) {
  const [shopId, setShopId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let scanner: any = null;
    if (isScanning) {
      const initScanner = async () => {
        if (!(window as any).Html5QrcodeScanner) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode';
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        if (!isScanning) return; 
        setTimeout(() => {
          try {
            scanner = new (window as any).Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
            scanner.render(
              (decodedText: string) => {
                setShopId(decodedText.trim());
                setIsScanning(false);
                if (scanner) { scanner.clear().catch(console.error); scanner = null; }
              },
              () => { /* ignore */ }
            );
          } catch(e) { setIsScanning(false); }
        }, 150);
      };
      initScanner();
    }
    return () => { if (scanner) scanner.clear().catch(console.error); };
  }, [isScanning]);

  const handleRedeem = async () => {
    const cleanShopId = shopId.trim();
    if (!cleanShopId || !activePass) return showToast("Invalid Shop ID", "error");
    setIsProcessing(true);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
      await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: cleanShopId, amount: 20, redeemedAt: new Date().toISOString() });
      onSuccess();
    } catch (e) {
      showToast("Error", "error");
    } finally { setIsProcessing(false); }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col font-sans max-w-md mx-auto">
      <div className="flex justify-between items-center mb-10 pt-4">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-full text-white"><ChevronLeft size={20}/></button>
        <h2 className="text-xl font-black tracking-tight">Scan to Pay</h2>
        <div className="w-10"></div>
      </div>
      
      <div className={`w-full aspect-square bg-black rounded-3xl mb-8 relative overflow-hidden flex items-center justify-center border border-slate-800 ${isScanning ? 'border-indigo-500' : ''}`}>
        {isScanning ? (
          <div id="qr-reader" className="w-full h-full bg-black absolute inset-0"></div>
        ) : (
          <div className="text-center">
            <Camera size={48} className="text-slate-600 mx-auto mb-4" />
            <button onClick={() => setIsScanning(true)} className="bg-white/10 px-6 py-3 rounded-full font-bold text-sm hover:bg-white/20 active:scale-95">Tap to Scan</button>
          </div>
        )}
      </div>

      <div className="bg-slate-800 p-6 rounded-3xl">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Or enter Shop ID</p>
        <input type="text" placeholder="Shop ID" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
          className="w-full bg-slate-900 text-center text-lg font-mono p-4 rounded-2xl outline-none focus:border-indigo-500 transition-all uppercase mb-4 border border-slate-700" />
        <button onClick={handleRedeem} disabled={!shopId || isProcessing} className="w-full bg-indigo-600 py-4 rounded-2xl font-bold active:scale-95 disabled:opacity-50">
          {isProcessing ? <Loader2 className="animate-spin mx-auto" size={20}/> : "Confirm"}
        </button>
      </div>
      
      <style>{`
        #qr-reader { border: none !important; width: 100% !important; border-radius: 1.5rem; overflow: hidden; background: transparent; }
        #qr-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
        #qr-reader__scan_region { background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: unset !important; }
        #qr-reader__dashboard_section_csr span { display: none !important; }
        #qr-reader__dashboard_section_swaplink { display: none !important; }
        #qr-reader button { display: none !important; }
        #qr-reader__camera_selection { display: none !important; }
      `}</style>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  return (
    <div className="min-h-screen bg-[#51B981] text-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 max-w-md mx-auto w-full relative">
      <div className="bg-white/20 p-4 rounded-full mb-6">
        <div className="bg-white text-[#51B981] p-6 rounded-full shadow-lg">
          <CheckCircle size={80} strokeWidth={3} />
        </div>
      </div>
      <h1 className="text-5xl font-black mb-10 tracking-tight drop-shadow-sm">สำเร็จ!</h1>
      <p className="text-white/90 text-sm font-medium mb-2">ระบบหักคูปองแล้ว</p>
      <p className="text-6xl font-black mb-16 drop-shadow-sm">20 <span className="text-3xl font-medium opacity-80">฿</span></p>
      <button onClick={onDone} className="bg-white text-[#51B981] w-full py-5 rounded-2xl font-bold text-lg active:scale-95 shadow-lg absolute bottom-10 max-w-[calc(100%-4rem)]">
        กลับหน้าหลัก
      </button>
    </div>
  );
}