"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon,
  XCircle, ScanLine, Edit2, MapPin, AlertTriangle, MessageSquareWarning, 
  Download, FileText, Info, Trash2, ArrowDownLeft, ArrowUpRight, Receipt,
  ChevronRight, ImagePlus
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

      <div className="max-w-md mx-auto bg-[#F9FAFB] min-h-screen shadow-[0_0_40px_rgba(0,0,0,0.05)] relative overflow-x-hidden border-x border-slate-100">
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

/* ==================== SUB COMPONENTS (Vibrant & Minimalist UI) ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user, userData, showToast, onEditName }: any) {
  // คืนชีพสีสันสดใส
  const bgColors: Record<string, string> = {
    indigo: "bg-indigo-600",
    orange: "bg-orange-500",
    slate: "bg-slate-900",
  };
  const bgClass = bgColors[color] || bgColors.indigo;

  return (
    <div className={`${bgClass} text-white px-6 py-10 md:py-12 rounded-b-[3rem] shadow-lg relative overflow-hidden w-full transition-all duration-500`}>
      <div className="absolute -right-8 -top-8 opacity-10 rotate-12 pointer-events-none">
        <Ticket size={180} />
      </div>
      <div className="flex justify-between items-start relative z-10">
        <div className="w-full pr-4 animate-in slide-in-from-left duration-500">
          <h2 className="text-4xl font-black italic tracking-tighter truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-white/80 text-xs font-bold uppercase tracking-widest truncate max-w-[200px]">
              {userData?.displayName || subtitle}
            </p>
            {onEditName && (
              <button onClick={onEditName} className="text-white/60 hover:text-white transition-colors bg-white/10 p-1.5 rounded-lg active:scale-90">
                <Edit2 size={12} />
              </button>
            )}
          </div>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-3 py-3 rounded-2xl transition-all active:scale-95 shrink-0 shadow-sm border border-white/10">
            <LogOut size={20} />
          </button>
        )}
      </div>
      {user && (
        <div className="mt-8 bg-black/20 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-xs relative z-10 border border-white/10">
          <div className="font-mono truncate max-w-[180px] text-white/90">{user.uid}</div>
          <button 
            onClick={() => { 
              navigator.clipboard.writeText(user.uid); 
              showToast("คัดลอก UID เรียบร้อย", "success"); 
            }}
            className="text-white hover:text-white flex items-center gap-1 text-[10px] font-bold px-3 py-2 bg-white/10 rounded-lg transition-colors active:scale-95 shrink-0"
          >
            <Copy size={14} /> COPY
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-3xl shadow-[0_5px_20px_rgba(0,0,0,0.03)] p-6 md:p-8 border border-slate-100 ${className}`}>{children}</div>;
}

/* Auth Screen */
function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading, showToast }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        
        {!isMerchantSetup && (
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-200 mb-6 rotate-3">
              <Ticket size={40} className="text-white" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
            <p className="text-slate-400 text-xs font-bold mt-2 uppercase tracking-[0.3em]">Digital Wallet</p>
          </div>
        )}

        {authMode === 'role_setup' ? (
          !isMerchantSetup ? (
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest mb-6">เลือกบทบาทของคุณ</p>
              <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
              <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
              <RoleButton icon={<Store />} title="ร้านค้า (Partner)" onClick={() => setIsMerchantSetup(true)} color="orange" />
            </div>
          ) : (
            <form onSubmit={handleMerchantSubmit} className="space-y-5 animate-in slide-in-from-right-4">
              <div className="text-center mb-6">
                <Store size={40} className="text-orange-500 mx-auto mb-4" />
                <h2 className="text-2xl font-black text-slate-800">สมัครเป็นร้านค้าพาร์ทเนอร์</h2>
                <p className="text-xs text-slate-500 mt-2">กรุณากรอกข้อมูลและยอมรับเงื่อนไข</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" placeholder="ชื่อร้านค้า" value={storeName} onChange={(e: any) => setStoreName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-orange-500 outline-none font-bold text-slate-700" required />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" placeholder="สถานที่ตั้ง / โซนโรงอาหาร" value={location} onChange={(e: any) => setLocation(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-orange-500 outline-none font-bold text-slate-700" required />
                </div>
              </div>

              <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 flex gap-4 items-start">
                <AlertTriangle className="text-orange-600 shrink-0 mt-1" size={20} />
                <div className="text-xs text-orange-900 leading-relaxed">
                  <span className="font-bold block mb-1">นโยบายและข้อตกลงทางกฎหมาย</span>
                  ข้าพเจ้าขอรับรองว่าข้อมูลร้านค้าเป็นความจริง และยินยอมปฏิบัติตามข้อตกลงของ MFU Pass หากพบการทุจริต ข้าพเจ้ายินยอมให้ทางระบบระงับบัญชี และอาจถูกดำเนินคดีตามกฎหมาย
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-2">
                <input type="checkbox" checked={acceptedPolicy} onChange={(e) => setAcceptedPolicy(e.target.checked)} className="w-5 h-5 accent-orange-500 rounded" />
                <span className="text-sm font-bold text-slate-700">ข้าพเจ้ายอมรับเงื่อนไขและข้อตกลง</span>
              </label>

              <div className="flex gap-3">
                <button type="button" onClick={() => setIsMerchantSetup(false)} className="flex-1 bg-slate-100 text-slate-600 font-black py-4 rounded-2xl hover:bg-slate-200">ยกเลิก</button>
                <button type="submit" className="flex-1 bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 active:scale-95">ส่งคำขอ</button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-slate-50 rounded-3xl p-2 border border-slate-100 shadow-inner">
              
              {authMode === 'register' && (
                <>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input type="text" placeholder="ชื่อผู้ใช้งาน (Display Name)" value={displayName} onChange={(e: any) => setDisplayName(e.target.value)}
                      className="w-full pl-14 pr-4 py-5 rounded-2xl bg-transparent outline-none font-bold text-slate-700 text-lg" required />
                  </div>
                  <div className="h-[1px] bg-slate-200 mx-4"></div>
                </>
              )}

              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input type="email" placeholder="อีเมล" value={email} onChange={(e: any) => setEmail(e.target.value)}
                  className="w-full pl-14 pr-4 py-5 rounded-2xl bg-transparent outline-none font-bold text-slate-700 text-lg" required />
              </div>
              
              <div className="h-[1px] bg-slate-200 mx-4"></div>
              
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input type={showPassword ? "text" : "password"} placeholder="รหัสผ่าน (6 ตัวอักษรขึ้นไป)" value={password} onChange={(e: any) => setPassword(e.target.value)}
                  className="w-full pl-14 pr-12 py-5 rounded-2xl bg-transparent outline-none font-bold text-slate-700 text-lg" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500">
                  {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                </button>
              </div>
            </div>

            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl text-xl active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 disabled:opacity-50">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={24} /> : <UserPlus size={24} />)}
              {authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-500 text-sm font-bold hover:text-indigo-600 transition-colors">
              {authMode === 'login' ? 'ยังไม่มีบัญชี? สร้างบัญชีใหม่' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white border border-slate-200 hover:border-indigo-500 p-5 rounded-3xl flex items-center gap-5 active:scale-95 transition-all shadow-sm">
      <div className={`bg-${color}-50 p-3 rounded-2xl text-${color}-600`}>{icon}</div>
      <div className="font-black text-xl text-slate-800">{title}</div>
      <ChevronRight size={20} className="ml-auto text-slate-300" />
    </button>
  );
}

/* Admin Dashboard */
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
      const clearCollection = async (colName: string) => {
        const snap = await getDocs(collection(db, colName));
        const promises = snap.docs.map((d: any) => deleteDoc(d.ref));
        await Promise.all(promises);
      };

      await clearCollection('passes');
      await clearCollection('purchases');
      await clearCollection('redemptions');
      await clearCollection('reports');

      const usersSnap = await getDocs(collection(db, 'users'));
      const userDeletePromises = usersSnap.docs.map((d: any) => {
        if (d.data().email !== ADMIN_EMAIL) {
          return deleteDoc(d.ref);
        }
        return Promise.resolve();
      });
      await Promise.all(userDeletePromises);

      showToast("รีเซ็ตระบบเรียบร้อยแล้ว", "success");
    } catch (error) {
      showToast("เกิดข้อผิดพลาดในการรีเซ็ตระบบ", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const globalHistory = [
    ...allPendingSlips.map((s: PurchaseSlip) => ({ ...s, type: 'purchase' as const, date: new Date(s.createdAt) })),
    ...allRedemptions.map((r: Redemption) => ({ ...r, type: 'redemption' as const, date: new Date(r.redeemedAt) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalPending = pendingSlips.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);
  const totalApproved = approvedSlips.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      <Header title="Admin Console" subtitle="System Control" onLogout={onLogout} user={user} userData={userData} onEditName={onEditName} color="slate" />
      
      <div className="px-6 pt-2 pb-2 flex gap-2 overflow-x-auto scrollbar-hide bg-slate-950 shrink-0">
        <TabButton active={adminTab==='overview'} onClick={()=>setAdminTab('overview')} label="Overview" dark />
        <TabButton active={adminTab==='slips'} onClick={()=>setAdminTab('slips')} label={`Slips (${pendingSlips.length})`} dark />
        <TabButton active={adminTab==='users'} onClick={()=>setAdminTab('users')} label="Users" dark />
        <TabButton active={adminTab==='history'} onClick={()=>setAdminTab('history')} label="History" dark />
        <TabButton active={adminTab==='settings'} onClick={()=>setAdminTab('settings')} label="Settings" dark />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {adminTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">รอตรวจสอบ</p>
                <p className="text-3xl font-black text-amber-400">{pendingSlips.length}</p>
              </div>
              <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">ร้านค้าใหม่</p>
                <p className="text-3xl font-black text-blue-400">{pendingMerchants.length}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-300 mb-4 text-sm uppercase tracking-widest">ปัญหาจากผู้ใช้ ({pendingReports.length})</h3>
              {pendingReports.length === 0 ? <p className="text-xs text-slate-600">No issues reported.</p> : pendingReports.map((r: ReportIssue) => (
                <div key={r.id} className="bg-red-500/10 p-5 rounded-3xl mb-3 border border-red-500/20">
                  <p className="text-sm text-red-400 font-medium mb-2">"{r.issue}"</p>
                  <p className="text-[10px] text-slate-500 font-mono mb-4">{r.email}</p>
                  <button onClick={() => { updateDoc(doc(db, 'reports', r.id), { status: 'resolved' }); showToast("Resolved", "success"); }} 
                    className="w-full bg-red-600/20 text-red-400 font-bold py-3 rounded-xl text-xs hover:bg-red-600/40">
                    Mark as Resolved
                  </button>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-bold text-slate-300 mb-4 text-sm uppercase tracking-widest">อนุมัติร้านค้า</h3>
              {pendingMerchants.length === 0 ? <p className="text-xs text-slate-600">No pending merchants.</p> : pendingMerchants.map((m: any) => (
                <div key={m.uid} className="bg-slate-900 p-5 rounded-3xl mb-3 border border-slate-800">
                  <p className="font-bold text-white">{m.storeName}</p>
                  <p className="text-xs text-slate-400 mb-4">{m.location} • {m.email}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isApproved: true })} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs">Approve</button>
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isRejected: true })} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold text-xs">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === 'slips' && (
          <div className="space-y-4 animate-in fade-in">
            {pendingSlips.length === 0 ? <p className="text-slate-600 text-sm text-center py-10">No pending slips.</p> : pendingSlips.map((slip: PurchaseSlip) => (
              <div key={slip.id} className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-mono text-slate-500 text-xs bg-black/40 px-3 py-1 rounded-lg">{slip.studentUid.slice(0,8)}</span>
                  <span className="font-black text-indigo-400 text-base">{slip.numSets} เซ็ต ({slip.totalAmount}฿)</span>
                </div>
                <img src={slip.slipUrl} className="w-full rounded-[2rem] mb-6 object-cover bg-black" alt="slip" />
                <div className="flex gap-3">
                  <button onClick={() => handleApproveSlip(slip)} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold text-sm active:scale-95 shadow-lg shadow-green-900/20">อนุมัติ</button>
                  <button onClick={() => { updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' }); showToast("Rejected", "info"); }} className="flex-1 bg-red-600/20 text-red-500 py-4 rounded-2xl font-bold text-sm active:scale-95">ปฏิเสธ</button>
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
                <div key={u.uid} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center">
                  <div className="truncate pr-2">
                    <p className="font-bold text-sm text-white truncate">{u.displayName || u.email}</p>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">{u.role} {u.role === 'merchant' ? (u.isApproved ? '(Active)' : '(Pending)') : ''}</p>
                  </div>
                  {['student', 'guest'].includes(u.role) && (
                    <button 
                      onClick={() => {
                        const newAm = prompt("แก้ไขจำนวนคูปอง:", pass?.remainingCoupons || "0");
                        if(newAm !== null && !isNaN(parseInt(newAm))) {
                          if (pass?.id) updateDoc(doc(db, 'passes', pass.id), { remainingCoupons: parseInt(newAm) });
                          else addDoc(collection(db, 'passes'), { studentUid: u.uid, remainingCoupons: parseInt(newAm) });
                        }
                      }}
                      className="bg-indigo-600/20 text-indigo-400 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-600/40 border border-indigo-500/20"
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
            {globalHistory.length === 0 ? <p className="text-slate-600 text-sm text-center py-10">No history yet.</p> : globalHistory.map((h: any, i) => (
              <div key={i} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${h.type === 'purchase' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-orange-500/20 text-orange-400'}`}>
                    {h.type === 'purchase' ? <Upload size={16} /> : <ScanLine size={16} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white">{h.type === 'purchase' ? 'ซื้อคูปอง' : 'ใช้คูปองแล้ว'}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{h.studentUid.slice(0,8)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-black text-sm ${h.status === 'rejected' ? 'text-red-500' : 'text-slate-300'}`}>
                    {h.type === 'purchase' ? `${h.totalAmount} ฿` : '-1 CPN'}
                  </p>
                  <p className="text-[10px] text-slate-500">{h.date.toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in pb-10">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800">
              <h3 className="font-bold text-white mb-6 text-lg">Payment Setup</h3>
              <div className="mb-6">
                <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest">ราคา 1 เซ็ต (5 คูปอง)</p>
                <input type="number" value={pricePerSet} onChange={(e: any) => setPricePerSet(e.target.value)} 
                  className="w-full bg-black/50 text-3xl font-black rounded-2xl p-5 outline-none border border-slate-700 focus:border-indigo-500 text-white text-center" />
              </div>
              <div className="mb-8">
                <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest">PromptPay QR Code</p>
                <label className="w-full bg-black/30 border border-slate-700 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer mb-4 hover:border-indigo-500 transition-colors">
                  <Upload size={24} className="text-slate-500 mb-2"/>
                  <span className="text-indigo-400 font-bold text-xs uppercase tracking-widest">Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                </label>
                <textarea value={promptPayQr} onChange={(e: any) => setPromptPayQr(e.target.value)} rows={2}
                  className="w-full bg-black/50 rounded-2xl p-4 text-xs font-mono outline-none resize-none border border-slate-700 text-slate-300" placeholder="Or paste Image URL..." />
                {promptPayQr && <img src={promptPayQr} className="mt-4 max-h-48 mx-auto rounded-2xl border border-slate-700" alt="QR Preview" />}
              </div>
              <button onClick={saveSettings} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black active:scale-95 transition-all text-lg shadow-lg shadow-indigo-900/20">Save Settings</button>
            </div>

            {/* DANGER ZONE */}
            <div className="bg-red-500/10 rounded-[2.5rem] p-8 border border-red-500/20 text-center">
              <AlertTriangle className="text-red-500 mx-auto mb-4" size={40} />
              <h3 className="font-black text-red-500 mb-2 text-xl">Danger Zone</h3>
              <p className="text-xs text-red-400/80 mb-8 leading-relaxed">ลบข้อมูลผู้ใช้งาน คูปอง สลิป และประวัติทั้งหมด (ยกเว้นแอดมิน)</p>
              <button onClick={handleSystemReset} disabled={isActionLoading} className="w-full bg-red-600 text-white font-black py-5 rounded-2xl active:scale-95 flex items-center justify-center gap-2 text-lg shadow-lg shadow-red-900/20 disabled:opacity-50">
                {isActionLoading ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />} System Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, dark = false }: any) {
  if (dark) {
    return (
      <button onClick={onClick} className={`px-5 py-3 rounded-2xl font-bold text-xs whitespace-nowrap transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
        {label}
      </button>
    );
  }
  return (
    <button onClick={onClick} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${active ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
      {label}
    </button>
  );
}

/* ==================== STUDENT DASHBOARD ==================== */
function StudentDashboardView({ user, userData, activePass, pendingPurchase, myPurchases, myRedemptions, onLogout, onBuyPass, onScan, showToast, onEditName }: any) {
  
  const handleReport = async () => {
    const issue = prompt("ระบุปัญหาที่พบ หรือข้อเสนอแนะ:");
    if(issue && issue.trim() !== "") {
      try {
        await addDoc(collection(getFirestore(), 'reports'), {
          studentUid: user.uid, email: user.email, issue: issue.trim(), status: 'pending', createdAt: new Date().toISOString()
        });
        showToast("ส่งรายงานให้ผู้ดูแลระบบแล้วครับ", "success");
      } catch (e) { showToast("ไม่สามารถส่งรายงานได้", "error"); }
    }
  };

  const history = [
    ...(myPurchases || []).map((p: any) => ({ ...p, type: 'purchase' as const, date: new Date(p.createdAt) })),
    ...(myRedemptions || []).map((r: any) => ({ ...r, type: 'redemption' as const, date: new Date(r.redeemedAt) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] max-w-md mx-auto w-full relative">
      <Header title="My Wallet" subtitle={userData?.role} user={user} userData={userData} onLogout={onLogout} onEditName={onEditName} showToast={showToast} color="indigo" />
      
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-12 space-y-8 z-10 relative">
        
        <Card className="flex flex-col items-center relative overflow-hidden animate-in zoom-in duration-500 !p-8">
          <div className="absolute top-0 w-full h-2 bg-indigo-500"></div>
          
          {activePass && activePass.remainingCoupons > 0 ? (
            <div className="w-full text-center">
              <p className="uppercase text-[10px] font-black text-slate-400 tracking-widest mb-2 mt-2">Available Coupons</p>
              <div className="text-[6rem] font-black leading-none text-slate-900 mb-2">{activePass.remainingCoupons}</div>
              <div className="bg-indigo-50 text-indigo-600 font-bold py-2.5 px-6 rounded-full inline-flex items-center gap-2 mb-8 text-sm border border-indigo-100">
                <Sparkles size={16}/> Total Value {activePass.remainingCoupons * 20} ฿
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={onScan} className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg active:scale-95 shadow-xl shadow-indigo-200/50 flex items-center justify-center gap-2">
                  <QrCode size={20}/> สแกนจ่าย
                </button>
                <button onClick={onBuyPass} className="flex-none bg-slate-100 text-slate-700 font-black px-5 rounded-2xl active:scale-95 hover:bg-slate-200 text-sm">
                  + ซื้อเพิ่ม
                </button>
              </div>
            </div>
          ) : pendingPurchase ? (
            <div className="text-center py-8">
              <Clock size={64} className="mx-auto text-amber-400 mb-6 animate-pulse" />
              <h3 className="font-black text-2xl text-slate-800 mb-2">กำลังรออนุมัติ</h3>
              <p className="text-slate-500 text-xs">แอดมินกำลังตรวจสอบสลิปของคุณ</p>
            </div>
          ) : (
            <div className="text-center py-8 w-full">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100"><Ticket size={32} className="text-slate-300"/></div>
              <h3 className="font-black text-2xl text-slate-800 mb-2">ยังไม่มีพาส</h3>
              <p className="text-slate-500 text-sm mb-8 px-4">ซื้อพาสส่วนลดใหม่เพื่อใช้เป็นส่วนลดที่โรงอาหาร</p>
              <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl active:scale-95 shadow-xl shadow-indigo-200/50 text-lg">ซื้อพาส (79.-)</button>
            </div>
          )}
        </Card>

        {/* History Log */}
        <div>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="font-bold text-slate-800 text-sm">ประวัติล่าสุด</h3>
            <button onClick={handleReport} className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1">รายงานปัญหา</button>
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-8 bg-white rounded-3xl border border-slate-100 shadow-sm">ยังไม่มีรายการทำธุรกรรม</p>
            ) : history.slice(0,5).map((h: any, idx: number) => (
              <div key={idx} className="bg-white p-5 rounded-[2rem] flex justify-between items-center border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${h.type === 'purchase' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
                    {h.type === 'purchase' ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">{h.type === 'purchase' ? 'ซื้อคูปอง' : 'ใช้คูปอง'}</p>
                    <p className="text-[10px] text-slate-400">{h.date.toLocaleDateString()} {h.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>
                <p className={`font-black text-lg ${h.type === 'purchase' ? 'text-indigo-600' : 'text-slate-800'}`}>
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
      showToast("ดาวน์โหลดสำเร็จ", "success");
    } catch (e) {
      window.open(qrCodeUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans w-full pb-12 max-w-md mx-auto relative">
      <Header title="Shop Center" subtitle={userData?.storeName || "Shop"} color="orange" onLogout={onLogout} user={user} userData={userData} showToast={showToast} onEditName={onEditName} />
      
      <div className="px-5 flex-1 w-full pt-6 space-y-6 animate-in slide-in-from-bottom-4 relative z-10">
        {!userData?.isApproved ? (
           <div className="bg-white text-center p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-xl font-black text-slate-800 mb-2">รออนุมัติ</h3>
             <p className="text-slate-500 text-xs">แอดมินกำลังตรวจสอบข้อมูลร้านค้า</p>
           </div>
        ) : (
          <>
            <div className="bg-white text-center p-10 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden">
              <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-2 relative z-10">รับคูปองแล้ววันนี้</p>
              <div className="text-[7rem] font-black leading-none text-orange-500 mb-6 relative z-10">{redemptions.length}</div>
              <div className="bg-orange-50 py-4 rounded-2xl border border-orange-100 relative z-10">
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-widest mb-1">ยอดเงินที่ระบบต้องจ่าย</p>
                <p className="text-3xl font-black text-orange-600">{redemptions.length * 20} ฿</p>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col items-center text-center">
               <p className="text-slate-800 font-black text-sm mb-4">QR Code ประจำร้าน</p>
               <div className="bg-white p-3 rounded-3xl shadow-sm border border-slate-100 mb-6">
                 <img src={qrCodeUrl} className="w-48 h-48 object-contain rounded-xl" alt="Store QR" />
               </div>
               <button onClick={downloadQR} className="bg-orange-600 text-white font-bold py-4 w-full rounded-2xl flex items-center justify-center gap-2 hover:bg-orange-700 active:scale-95 text-sm shadow-lg shadow-orange-200/50">
                 <Download size={16} /> โหลด QR Code ติดหน้าร้าน
               </button>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">ประวัติการรับ</h3>
              <div className="space-y-3">
                {redemptions.length === 0 ? <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-3xl border border-slate-100">ยังไม่มีรายการวันนี้</p> : redemptions.slice(0, 10).map((r: any, idx: number) => (
                  <div key={idx} className="bg-white p-5 rounded-[2rem] flex justify-between items-center shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="bg-green-50 p-3 rounded-2xl text-green-600"><Receipt size={20}/></div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">รับคูปอง</p>
                        <p className="text-[10px] text-slate-400">{new Date(r.redeemedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                      </div>
                    </div>
                    <p className="font-black text-green-600 text-lg">+20 ฿</p>
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
      if(!file.type.startsWith('image/')) return showToast('กรุณาอัปโหลดรูปภาพเท่านั้น', 'error');
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6 font-sans flex flex-col max-w-md mx-auto w-full animate-in fade-in">
      <div className="flex items-center justify-between mb-8 pt-4">
        <button onClick={onBack} className="p-3 bg-slate-50 rounded-2xl text-slate-600 hover:bg-slate-100 active:scale-90"><ChevronLeft size={20}/></button>
        <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Buy Pass</h2>
        <div className="w-12"></div>
      </div>

      <div className="flex-1 space-y-6">
        <div className="bg-slate-50 rounded-[2.5rem] p-8 text-center border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">จำนวนเซ็ต (1 เซ็ต = 5 ใบ)</p>
          <div className="flex justify-center items-center gap-6 mb-8">
            <button onClick={() => setNumSets((n: number) => Math.max(1, n-1))} className="w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Minus size={24}/></button>
            <div className="text-6xl font-black text-slate-800 w-16">{numSets}</div>
            <button onClick={() => setNumSets((n: number) => n+1)} className="w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Plus size={24}/></button>
          </div>
          <div className="pt-6 border-t border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">ยอดที่ต้องชำระ</p>
            <p className="text-4xl font-black text-indigo-600">{totalAmount} <span className="text-xl">฿</span></p>
          </div>
        </div>

        {settings?.promptPayQr && (
          <div className="bg-slate-50 rounded-[2.5rem] p-8 text-center border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Scan QR เพื่อโอนเงิน</p>
            <img src={settings.promptPayQr} className="w-48 h-48 mx-auto rounded-[2rem] object-contain bg-white p-3 shadow-sm" alt="QR" />
          </div>
        )}

        <div>
          <label className="border-2 border-dashed border-indigo-200 bg-indigo-50/30 rounded-[2.5rem] h-56 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 transition-all overflow-hidden relative">
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip" /> : (
              <div className="text-center"><Upload size={40} className="text-indigo-300 mx-auto mb-3" /><p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">อัปโหลดสลิปที่นี่</p></div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>

      <button onClick={async () => {
          if (!slip) return showToast("กรุณาอัปโหลดสลิปก่อน", "error");
          setIsLoading(true);
          await addDoc(collection(getFirestore(), 'purchases'), { studentUid: user.uid, numSets, totalAmount, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
          setIsLoading(false);
          onBack();
      }} disabled={!slip || isLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] text-xl mt-8 active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-200/50">
        {isLoading ? <Loader2 className="animate-spin mx-auto"/> : "ยืนยันการทำรายการ"}
      </button>
    </div>
  );
}

/* ==================== SCAN QR VIEW (Native Camera Core) ==================== */
function ScanQRView({ onBack, activePass, user, onSuccess, showToast }: any) {
  const [shopId, setShopId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let html5QrCode: any = null;

    if (isScanning) {
      const initScanner = async () => {
        if (!(window as any).Html5Qrcode) {
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

        // ใช้ HTML5Qrcode Core โดยตรง (เสถียรกว่าบนมือถือ)
        setTimeout(() => {
          try {
            html5QrCode = new (window as any).Html5Qrcode("qr-reader");
            html5QrCode.start(
              { facingMode: "environment" },
              { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
              (decodedText: string) => {
                setShopId(decodedText.trim());
                setIsScanning(false);
                showToast("สแกนสำเร็จ", "success");
                if (html5QrCode) { html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.log); html5QrCode = null; }
              },
              () => { /* ignore frame errors */ }
            ).catch((err: any) => {
              showToast("ไม่สามารถเปิดกล้องได้ กรุณาให้สิทธิ์", "error");
              setIsScanning(false);
            });
          } catch(e) {
             setIsScanning(false);
          }
        }, 300);
      };
      
      initScanner();
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.log);
      }
    };
  }, [isScanning]);

  const handleRedeem = async () => {
    const cleanShopId = shopId.trim();
    if (!cleanShopId || !activePass) return showToast("กรุณาระบุ Shop ID", "error");
    setIsProcessing(true);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
      await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: cleanShopId, amount: 20, redeemedAt: new Date().toISOString() });
      onSuccess();
    } catch (e) {
      showToast("เกิดข้อผิดพลาด", "error");
    } finally { setIsProcessing(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center max-w-md mx-auto font-sans relative">
      
      <div className="absolute top-12 left-6 z-10">
        <button onClick={onBack} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90"><ChevronLeft size={24}/></button>
      </div>

      <div className="w-full mt-10 animate-in slide-in-from-bottom-8 duration-500">
        <h2 className="text-3xl font-black mb-8 italic tracking-tighter text-center text-indigo-400">Scan to Pay</h2>
        
        <div className={`w-full aspect-square bg-black rounded-[3rem] relative overflow-hidden flex items-center justify-center border border-slate-800 shadow-2xl mb-8 ${isScanning ? 'border-indigo-500 shadow-[0_0_60px_rgba(99,102,241,0.3)]' : ''}`}>
          {isScanning ? (
            <div id="qr-reader" className="w-full h-full bg-black absolute inset-0"></div>
          ) : (
            <div className="text-center">
              <Camera size={60} className="text-slate-700 mx-auto mb-6" />
              <button onClick={() => setIsScanning(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-sm active:scale-95 shadow-lg shadow-indigo-900/50 flex items-center gap-2 mx-auto">
                <ScanLine size={18} /> แตะเพื่อเปิดกล้อง
              </button>
            </div>
          )}
          {isScanning && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_20px_#6366f1] animate-[scan_3s_ease-in-out_infinite]"></div>}
          <style>{`@keyframes scan { 0% { top: 10%; opacity:0; } 20% {opacity:1;} 80% {opacity:1;} 100% { top: 90%; opacity:0; } }`}</style>
        </div>

        {isScanning && (
          <div className="text-center mb-8">
            <button onClick={() => setIsScanning(false)} className="bg-slate-800 text-slate-300 font-bold px-6 py-3 rounded-full text-xs uppercase tracking-widest active:scale-95 border border-slate-700">
              ปิดกล้อง
            </button>
          </div>
        )}

        <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">Or Manual Entry</p>
          <input type="text" placeholder="SHOP ID" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
            className="w-full bg-black/50 text-center text-2xl font-mono p-5 rounded-2xl outline-none focus:border-indigo-500 transition-all uppercase mb-6 border border-slate-800 text-indigo-300" />
          <button onClick={handleRedeem} disabled={!shopId || isProcessing} className="w-full bg-indigo-600 py-5 rounded-2xl font-black text-lg active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-900/40">
            {isProcessing ? <Loader2 className="animate-spin mx-auto" size={24}/> : "ยืนยันการจ่าย"}
          </button>
        </div>
      </div>

      <style>{`
        #qr-reader { width: 100% !important; height: 100% !important; border: none !important; }
        #qr-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; border-radius: 3rem !important; }
      `}</style>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#10b981] text-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 max-w-md mx-auto w-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,transparent_70%)] pointer-events-none"></div>
      
      <div className="bg-white/20 p-4 rounded-full mb-8 relative z-10">
        <div className="bg-white text-[#10b981] p-8 rounded-full shadow-2xl animate-bounce">
          <CheckCircle size={80} strokeWidth={3.5} />
        </div>
      </div>
      
      <h1 className="text-5xl font-black mb-10 tracking-tight drop-shadow-md relative z-10">สำเร็จ!</h1>
      
      <div className="bg-black/15 p-8 rounded-[3rem] backdrop-blur-xl mb-12 w-full border border-white/20 relative z-10 shadow-xl animate-in zoom-in">
         <p className="text-[10px] uppercase font-black tracking-[0.3em] mb-2 opacity-80">ระบบหักคูปองแล้ว</p>
         <p className="text-7xl font-black tracking-tighter">20<span className="text-4xl opacity-50 ml-2">฿</span></p>
      </div>
      
      <div className="text-6xl font-mono font-black tracking-tighter mb-20 opacity-90 drop-shadow-md animate-pulse relative z-10">
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      
      <button onClick={onDone} className="bg-white text-[#10b981] w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all uppercase tracking-widest relative z-10 max-w-xs">
        กลับหน้าหลัก
      </button>
    </div>
  );
}