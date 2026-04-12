"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon,
  XCircle, ScanLine, Edit2, MapPin, AlertTriangle, FileText
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut, updateProfile
} from "firebase/auth";

import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, 
  onSnapshot, updateDoc, increment, serverTimestamp, query, where, getDocs, orderBy
} from "firebase/firestore";

/* ==================== TYPES ==================== */
interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
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
  createdAt?: string;
}

interface AppSettings {
  pricePerSet: number;
  promptPayQr: string | null;
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
  const [allPendingSlips, setAllPendingSlips] = useState<PurchaseSlip[]>([]);
  const [allPendingMerchants, setAllPendingMerchants] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
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
        const pending = snap.docs.find((d: any) => d.data().studentUid === user.uid && d.data().status === 'pending');
        setPendingPurchase(pending ? { id: pending.id, ...pending.data() } : null);
      }));
    }

    if (currentView === 'merchant') {
      // ดึงประวัติการรับคูปองของร้านค้านั้นๆ (Realtime)
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        // กรองเฉพาะที่ merchantId ตรงกับตัวเอง
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => d.data());
        // เรียงลำดับจากใหม่ไปเก่า (จำลองการ Sort ฝั่ง Client เพื่อลดปัญหา Index)
        filtered.sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());
        setRedemptions(filtered);
      }));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter((d: any) => d.data().role === 'merchant' && d.data().isApproved === false).map((d: any) => ({ id: d.id, ...d.data() })));
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
      isApproved: role !== 'merchant', // ร้านค้าต้องรอแอดมินอนุมัติเสมอ
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
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in w-[90%] max-w-sm">
          <div className={`px-6 py-4 rounded-2xl font-bold text-white shadow-xl flex items-center justify-center gap-2 ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-blue-500' : 'bg-green-500'}`}>
            {toast.type === 'error' && <XCircle size={20} />}
            {toast.type === 'success' && <CheckCircle size={20} />}
            <span className="text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {currentView === 'auth' && <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} showToast={showToast} />}
      {currentView === 'admin' && <AdminDashboardView allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={handleLogout} showToast={showToast} user={user} userData={userData} onEditName={handleEditName} />}
      {(currentView === 'student' || currentView === 'guest') && <StudentDashboardView user={user} userData={userData} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} showToast={showToast} onEditName={handleEditName} />}
      {currentView === 'merchant' && <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} onLogout={handleLogout} showToast={showToast} onEditName={handleEditName} />}
      {currentView === 'buy_pass' && <BuyPassView settings={systemSettings} onBack={() => setCurrentView(userData?.role || 'student')} user={user} showToast={showToast} />}
      {currentView === 'scan_qr' && <ScanQRView onBack={() => setCurrentView(userData?.role || 'student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} showToast={showToast} />}
      {currentView === 'success' && <SuccessView onDone={() => setCurrentView(userData?.role || 'student')} />}
    </div>
  );
}

/* ==================== SUB COMPONENTS ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user, userData, showToast, onEditName }: any) {
  return (
    <div className={`bg-${color}-600 text-white px-6 py-8 md:py-10 rounded-b-[3rem] shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full`}>
      <div className="absolute -right-8 -top-8 opacity-10 rotate-12 pointer-events-none">
        <Ticket size={180} />
      </div>
      <div className="flex justify-between items-start">
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter">{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-white/90 text-sm font-bold uppercase tracking-widest truncate max-w-[200px]">
              {userData?.displayName || subtitle}
            </p>
            {onEditName && (
              <button onClick={onEditName} className="text-white/50 hover:text-white transition-colors bg-white/10 p-1.5 rounded-lg active:scale-90">
                <Edit2 size={14} />
              </button>
            )}
          </div>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-3 rounded-2xl transition-all relative z-10 active:scale-95">
            <LogOut size={22} />
          </button>
        )}
      </div>
      {user && (
        <div className="mt-6 bg-black/20 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-xs relative z-10 border border-white/10">
          <div className="font-mono truncate max-w-[180px] text-white/80">{user.uid}</div>
          <button 
            onClick={() => { 
              navigator.clipboard.writeText(user.uid); 
              showToast("คัดลอก UID เรียบร้อย", "success"); 
            }}
            className="text-white hover:text-white flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 bg-white/10 rounded-lg transition-colors active:scale-95"
          >
            <Copy size={14} /> COPY
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-3xl shadow-xl p-6 md:p-8 ${className}`}>{children}</div>;
}

/* Auth Screen with Merchant Policy */
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
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md md:max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 animate-in zoom-in duration-500 border border-slate-50">
        
        {!isMerchantSetup && (
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-indigo-200 shadow-xl mb-6 rotate-3">
              <Ticket size={40} className="text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
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
            // Merchant Registration Policy Form
            <form onSubmit={handleMerchantSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4">
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
                  ข้าพเจ้าขอรับรองว่าข้อมูลร้านค้าเป็นความจริง และยินยอมปฏิบัติตามข้อตกลงของ MFU Pass หากพบการทุจริต (เช่น การสแกนคูปองโดยไม่มีการซื้อขายจริง หรือการละทิ้งการให้บริการ) ข้าพเจ้ายินยอมให้ทางระบบระงับบัญชี และอาจถูกดำเนินคดีตามกฎหมาย
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
                <input type="email" placeholder="อีเมลจริง" value={email} onChange={(e: any) => setEmail(e.target.value)}
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

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-indigo-600 transition-colors">
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
    <button onClick={onClick} className="w-full bg-white border-2 border-transparent hover:border-indigo-500 p-5 rounded-[2rem] flex items-center gap-6 active:scale-95 transition-all shadow-sm">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600`}>{icon}</div>
      <div className="font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

/* Admin Dashboard - Update Revenue & Show Merchant Details */
function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout, showToast, user, userData, onEditName }: any) {
  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const [promptPayQr, setPromptPayQr] = useState(systemSettings.promptPayQr || "");
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: any) => s.status === 'pending');
  const approvedSlips = allPendingSlips.filter((s: any) => s.status === 'approved');

  // ป้องกันค่า NaN ด้วย Number() fallback
  const totalPending = pendingSlips.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);
  const totalApproved = approvedSlips.reduce((sum: number, s: any) => sum + (Number(s.totalAmount) || 0), 0);

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'global'), { pricePerSet: Number(pricePerSet), promptPayQr }, { merge: true });
    showToast("บันทึกการตั้งค่าเรียบร้อยแล้ว", "success");
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
      showToast("อนุมัติรายการสำเร็จ", "success");
    } catch(err) {
      showToast("เกิดข้อผิดพลาดในการอนุมัติ", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8 md:px-8 font-sans max-w-3xl mx-auto pb-20">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-black text-indigo-400 italic">Admin Console</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest font-bold">{userData?.displayName || 'Super Admin'}</span>
            <button onClick={onEditName} className="text-slate-500 hover:text-white transition-colors bg-white/10 p-1.5 rounded-lg active:scale-90"><Edit2 size={12} /></button>
          </div>
        </div>
        <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 active:scale-95"><LogOut size={20} /></button>
      </div>

      <div className="bg-slate-900 rounded-[2.5rem] p-6 md:p-8 mb-8 border border-slate-800 shadow-2xl">
        <h3 className="font-bold text-indigo-300 mb-6 flex items-center gap-2"><Settings size={18} /> การตั้งค่าระบบ</h3>
        <div className="mb-6">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">ราคา 1 เซ็ต (5 คูปอง)</p>
          <input type="number" value={pricePerSet} onChange={(e: any) => setPricePerSet(e.target.value)} 
            className="w-full bg-black/50 text-4xl font-black text-center rounded-2xl p-5 outline-none border border-slate-700 focus:border-indigo-500" />
        </div>
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">PromptPay QR Code (URL)</p>
          <textarea value={promptPayQr} onChange={(e: any) => setPromptPayQr(e.target.value)} rows={3}
            className="w-full bg-black/50 rounded-2xl p-5 text-sm font-mono outline-none resize-none border border-slate-700 focus:border-indigo-500" placeholder="https://..." />
          {promptPayQr && <img src={promptPayQr} className="mt-4 max-h-64 mx-auto rounded-2xl" alt="QR Preview" />}
        </div>
        <button onClick={saveSettings} className="w-full mt-8 bg-indigo-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-500 active:scale-95 transition-all">
          <Save size={20} /> บันทึกการตั้งค่า
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6 mb-10">
        <div className="bg-slate-900 rounded-3xl p-6 text-center border border-slate-800">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-2">ยอดรอตรวจสอบ</p>
          <p className="text-4xl font-black">{totalPending.toLocaleString()} ฿</p>
        </div>
        <div className="bg-slate-900 rounded-3xl p-6 text-center border border-slate-800">
          <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">ยอดอนุมัติแล้ว</p>
          <p className="text-4xl font-black text-green-400">{totalApproved.toLocaleString()} ฿</p>
        </div>
      </div>

      <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-4 px-2">สลิปที่รอตรวจสอบ ({pendingSlips.length})</h3>
      {pendingSlips.map((slip: PurchaseSlip) => (
        <div key={slip.id} className="bg-slate-900 rounded-[2.5rem] p-6 mb-6 border border-slate-800">
          <div className="flex justify-between items-center text-xs mb-4 bg-black/40 p-4 rounded-2xl">
            <span className="font-mono text-slate-400">{slip.studentUid.slice(0,10)}...</span>
            <span className="font-black text-indigo-400 text-base">เซ็ต {slip.numSets} ({slip.totalAmount}฿)</span>
          </div>
          <img src={slip.slipUrl} className="w-full rounded-[2rem] mb-6 aspect-[3/4] object-cover border border-slate-800" alt="slip" />
          <div className="flex gap-4">
            <button onClick={() => handleApproveSlip(slip)} className="flex-1 bg-green-600 py-5 rounded-2xl font-black active:scale-95 transition-all">อนุมัติ</button>
            <button onClick={async () => {
              await updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' });
              showToast("ปฏิเสธรายการ", "info");
            }} className="flex-1 bg-red-600 py-5 rounded-2xl font-black active:scale-95 transition-all">ปฏิเสธ</button>
          </div>
        </div>
      ))}

      <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-4 px-2 mt-12">ร้านค้ารออนุมัติ ({allPendingMerchants.length})</h3>
      {allPendingMerchants.map((m: any) => (
        <div key={m.id} className="bg-slate-900 rounded-[2.5rem] p-6 mb-4 border border-slate-800">
          <div className="mb-4">
            <p className="font-bold text-orange-400 text-lg">{m.storeName || 'ไม่ได้ระบุชื่อ'}</p>
            <p className="text-sm text-slate-300 mt-1 flex items-center gap-1"><MapPin size={14}/> {m.location || 'ไม่ได้ระบุสถานที่'}</p>
            <p className="text-xs text-slate-500 mt-2">Email: {m.email}</p>
          </div>
          <div className="bg-green-500/10 text-green-400 p-3 rounded-xl text-xs font-bold mb-4 flex items-center gap-2">
            <CheckCircle size={14}/> ยอมรับเงื่อนไขและข้อตกลงแล้ว
          </div>
          <button onClick={async () => { 
            await updateDoc(doc(db, 'users', m.id), { isApproved: true }); 
            showToast("อนุมัติร้านค้าเรียบร้อย", "success");
          }} className="w-full bg-green-600 py-4 rounded-2xl font-bold text-sm uppercase active:scale-95">อนุมัติ Partner</button>
        </div>
      ))}
    </div>
  );
}

function StudentDashboardView({ user, userData, activePass, pendingPurchase, onLogout, onBuyPass, onScan, showToast, onEditName }: any) {
  const roleName = userData?.role === 'guest' ? 'Guest' : 'Student';
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-12 max-w-2xl mx-auto w-full">
      <Header title="My Wallet" subtitle={roleName} user={user} userData={userData} onLogout={onLogout} showToast={showToast} onEditName={onEditName} />
      <div className="px-6 flex-1 space-y-8 animate-in slide-in-from-bottom-8 duration-500">
        <Card className="p-10 border-indigo-50 shadow-indigo-100/50">
          {pendingPurchase ? (
            <div className="text-center py-12">
              <Clock size={60} className="mx-auto text-amber-500 mb-6 animate-pulse" />
              <h3 className="font-black text-2xl text-slate-800 mb-2">รอตรวจสอบสลิป</h3>
              <p className="text-slate-500 text-sm">จำนวน {pendingPurchase.numSets} เซ็ต • ยอด {pendingPurchase.totalAmount} บาท</p>
            </div>
          ) : activePass && activePass.remainingCoupons > 0 ? (
            <div className="text-center">
              <div className="flex justify-between w-full mb-6">
                <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Wallet size={24}/></div>
                <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div> Active</div>
              </div>
              <p className="uppercase text-[10px] font-black text-slate-400 tracking-[0.2em] mb-2">คูปองคงเหลือ</p>
              <div className="text-[7rem] font-black leading-none text-slate-900 tracking-tighter mb-2">{activePass.remainingCoupons}</div>
              <div className="inline-flex bg-green-50 text-green-600 font-black py-2 px-6 rounded-full mb-10 items-center gap-2 border border-green-100">
                <Sparkles size={16}/> มูลค่ารวม {activePass.remainingCoupons * 20} ฿
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={onScan} className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-[1.5rem] text-lg active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3">
                  <QrCode size={20}/> แสกนจ่าย
                </button>
                <button onClick={onBuyPass} className="flex-none bg-slate-100 text-indigo-600 font-black px-6 rounded-[1.5rem] active:scale-95 transition-all hover:bg-slate-200 text-sm uppercase tracking-widest">
                  + ซื้อเพิ่ม
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Ticket size={40} className="text-slate-300"/></div>
              <h3 className="font-black text-2xl text-slate-800 mb-2">กระเป๋าว่างเปล่า</h3>
              <p className="text-slate-500 text-sm mb-8 px-4">ซื้อพาสใหม่เพื่อรับคูปองส่วนลด 5 ใบ สำหรับใช้ที่โรงอาหาร</p>
              <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] text-xl active:scale-95 shadow-xl shadow-indigo-200 transition-all">ซื้อพาสใหม่</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function BuyPassView({ settings, onBack, user, showToast }: any) {
  const [numSets, setNumSets] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const totalAmount = Number(settings.pricePerSet) * numSets;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return showToast('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', 'error');
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = async () => {
    if (!slip || !user) return showToast("กรุณาอัปโหลดสลิปยืนยัน", "error");
    setIsLoading(true);
    const db = getFirestore();
    await addDoc(collection(db, 'purchases'), {
      studentUid: user.uid,
      numSets,
      totalAmount, // Ensure it's a number for admin calculation
      slipUrl: slip,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    showToast(`ส่งสลิปยอด ${totalAmount} บาท เรียบร้อยแล้ว`, "success");
    setIsLoading(false);
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 md:p-8 max-w-2xl mx-auto w-full font-sans pb-10">
      <button onClick={onBack} className="flex items-center gap-2 mb-8 text-slate-500 font-bold text-xs uppercase tracking-widest active:scale-90"><ChevronLeft size={20} /> กลับ</button>
      <h2 className="text-4xl font-black mb-8 italic tracking-tighter">Buy Pass</h2>

      <Card className="mb-6 p-8 text-center animate-in zoom-in border-indigo-100 border-2">
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6">เลือกจำนวนเซ็ต (1 เซ็ต = 5 คูปอง)</p>
        <div className="flex justify-center items-center gap-8 mb-8 bg-slate-50 py-4 rounded-[2rem]">
          <button onClick={() => setNumSets((n: number) => Math.max(1, n-1))} className="text-3xl font-black w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 active:scale-90"><Minus size={24}/></button>
          <div className="text-6xl font-black text-slate-800 w-16">{numSets}</div>
          <button onClick={() => setNumSets((n: number) => n+1)} className="text-3xl font-black w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 active:scale-90"><Plus size={24}/></button>
        </div>
        <div className="bg-indigo-50 py-4 rounded-[1.5rem]">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">ยอดโอนทั้งหมด</p>
          <p className="text-4xl font-black text-indigo-600">{totalAmount} <span className="text-lg">฿</span></p>
        </div>
      </Card>

      {settings.promptPayQr && (
        <Card className="mb-6 p-8 text-center shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">สแกนเพื่อโอนเงิน</p>
          <img src={settings.promptPayQr} className="w-full max-w-[200px] mx-auto rounded-3xl" alt="QR" />
          <p className="mt-6 font-bold text-sm text-slate-600">MFU Pass Official Account</p>
        </Card>
      )}

      <Card className="p-8 border border-slate-200">
        <p className="text-center font-black text-slate-700 mb-6">อัปโหลดสลิปยืนยัน</p>
        <label className="border-2 border-dashed border-slate-200 rounded-[2rem] h-64 md:h-80 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative group">
          {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip" /> : (
            <div className="text-center"><Upload size={48} className="text-slate-300 mx-auto mb-4 group-hover:text-indigo-400 transition-colors" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">แตะเพื่อเลือกรูปภาพ</p></div>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </Card>

      <button onClick={handleConfirm} disabled={!slip || isLoading} className="mt-10 w-full bg-indigo-600 text-white font-black py-7 rounded-[2rem] text-xl active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center">
        {isLoading ? <Loader2 className="animate-spin" /> : "ส่งสลิปยืนยัน"}
      </button>
    </div>
  );
}

function MerchantDashboardView({ user, userData, redemptions, onLogout, showToast, onEditName }: any) {
  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans max-w-2xl mx-auto w-full pb-12">
      <Header title="Shop Center" subtitle={userData?.storeName || "Shop Console"} color="orange" onLogout={onLogout} user={user} userData={userData} showToast={showToast} onEditName={onEditName} />
      <div className="px-6 -mt-8 flex-1 animate-in slide-in-from-bottom-8 duration-700">
        {!userData?.isApproved ? (
          <Card className="text-center py-16 border-4 border-dashed border-orange-200 shadow-orange-100">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-2xl font-black text-slate-800 mb-2">รออนุมัติเปิดร้าน</h3>
             <p className="text-slate-500 text-sm">แอดมินกำลังตรวจสอบข้อมูลร้านค้าของคุณ</p>
          </Card>
        ) : (
          <>
            <Card className="text-center p-12 border-none shadow-orange-100/60 relative overflow-hidden mb-6">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-orange-100 rounded-full blur-3xl opacity-50"></div>
              <p className="text-slate-400 font-black text-xs uppercase mb-4 tracking-widest relative z-10">รับคูปองแล้ววันนี้</p>
              <div className="text-[8rem] font-black leading-none text-orange-500 mb-8 relative z-10">{redemptions.length}</div>
              <div className="bg-orange-600 py-6 rounded-[2.5rem] shadow-xl text-white relative z-10">
                <p className="text-orange-200 text-[10px] font-black uppercase mb-1 tracking-widest">ยอดเงินที่ระบบต้องจ่าย</p>
                <p className="text-5xl font-black">{redemptions.length * 20} <span className="text-2xl">฿</span></p>
              </div>
            </Card>

            {/* แสดงประวัติการทำรายการล่าสุด */}
            <div className="mb-8">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">ประวัติการทำรายการล่าสุด</h3>
              {redemptions.length === 0 ? (
                <p className="text-slate-400 text-sm italic text-center py-4 bg-white rounded-2xl border border-slate-100">ยังไม่มีรายการวันนี้</p>
              ) : (
                <div className="space-y-3">
                  {redemptions.slice(0, 5).map((r: any, idx: number) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full text-green-600"><Ticket size={16}/></div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">ได้รับคูปอง</p>
                          <p className="text-[10px] text-slate-400">{new Date(r.redeemedAt).toLocaleTimeString('th-TH')}</p>
                        </div>
                      </div>
                      <p className="font-black text-green-600">+20 ฿</p>
                    </div>
                  ))}
                  {redemptions.length > 5 && <p className="text-center text-xs text-slate-400 mt-4">มีรายการอีก {redemptions.length - 5} รายการ</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ==================== SCAN QR VIEW (REAL CAMERA + MANUAL ID) ==================== */
function ScanQRView({ onBack, activePass, user, onSuccess, showToast }: any) {
  const [shopId, setShopId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // ระบบโหลด Html5Qrcode แบบ Dynamic พร้อม Delay กันจอขาว
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

        // หน่วงเวลาให้ DOM <div id="qr-reader"> พร้อมแน่นอนบนมือถือ
        setTimeout(() => {
          try {
            scanner = new (window as any).Html5QrcodeScanner(
              "qr-reader",
              { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
              false
            );
            
            scanner.render(
              (decodedText: string) => {
                setShopId(decodedText.trim()); // Trim อัตโนมัติ
                setIsScanning(false);
                showToast("สแกนสำเร็จ กรุณากดยืนยัน", "success");
                if (scanner) {
                  scanner.clear().catch(console.error);
                  scanner = null;
                }
              },
              (error: any) => { /* ignore */ }
            );
          } catch(e) {
             showToast("ไม่สามารถเปิดกล้องได้ กรุณาให้สิทธิ์เข้าถึงกล้อง", "error");
             setIsScanning(false);
          }
        }, 150);
      };
      
      initScanner();
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [isScanning]);

  const handleRedeem = async () => {
    // ใส่ .trim() เพื่อลบช่องว่างเผื่อนักศึกษาก๊อปปี้มาแล้วมีวรรคติดมา
    const cleanShopId = shopId.trim();
    if (!cleanShopId || !activePass) return showToast("กรุณาระบุ Shop ID", "error");
    
    setIsProcessing(true);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
      await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: cleanShopId, amount: 20, redeemedAt: new Date().toISOString() });
      onSuccess();
    } catch (e) {
      showToast("เกิดข้อผิดพลาดในการทำรายการ", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10 flex flex-col items-center justify-center max-w-2xl mx-auto w-full font-sans">
      <h2 className="text-3xl font-black mb-10 italic text-indigo-400">REDEEM COUPON</h2>
      
      <div className={`w-full max-w-sm aspect-square border-4 border-indigo-500 rounded-[3rem] flex flex-col items-center justify-center bg-black mb-8 relative overflow-hidden transition-all ${isScanning ? 'shadow-[0_0_50px_rgba(99,102,241,0.4)]' : ''}`}>
        {isScanning ? (
          <div id="qr-reader" className="w-full h-full bg-white flex flex-col items-center justify-center"></div>
        ) : (
          <>
            <Camera size={80} className="text-slate-600 mb-6" />
            <button 
              onClick={() => setIsScanning(true)} 
              className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/50 px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all active:scale-95"
            >
              <ScanLine size={18} /> เปิดกล้องสแกน QR
            </button>
          </>
        )}
      </div>

      {isScanning && (
        <button onClick={() => setIsScanning(false)} className="mb-6 bg-red-600/20 text-red-400 border border-red-500/50 px-6 py-2 rounded-full font-bold text-xs uppercase tracking-widest active:scale-95">
          ปิดกล้อง
        </button>
      )}

      <div className="w-full max-w-sm bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">หรือกรอก Shop ID ด้วยตนเอง</p>
        <input type="text" placeholder="PASTE SHOP ID" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
          className="w-full bg-black/50 text-center text-xl font-mono p-5 rounded-2xl border border-slate-700 outline-none focus:border-indigo-500 transition-all text-indigo-200 uppercase mb-6" />
        <button onClick={handleRedeem} disabled={!shopId || isProcessing} className="w-full bg-indigo-600 py-5 rounded-2xl font-black text-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center shadow-lg shadow-indigo-900/50">
          {isProcessing ? <Loader2 className="animate-spin" /> : "ยืนยันการใช้สิทธิ์"}
        </button>
      </div>

      <button onClick={onBack} className="mt-10 text-slate-500 font-bold text-xs uppercase tracking-widest hover:text-white transition-colors">ยกเลิก</button>
      
      <style>{`
        #qr-reader { border: none !important; width: 100% !important; border-radius: 2.5rem; }
        #qr-reader__scan_region { min-height: 100% !important; background: black; display: flex; align-items: center; justify-content: center;}
        #qr-reader__dashboard_section_csr span { color: #4f46e5 !important; font-family: sans-serif; font-size: 12px; font-weight: bold;}
        #qr-reader__dashboard_section_swaplink { color: #818cf8 !important; text-decoration: none; margin-top: 10px; display: inline-block; font-weight: bold; font-family: sans-serif;}
        #qr-reader button { background: #4f46e5 !important; border: none; color: white; padding: 10px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; font-family: sans-serif; margin-top: 10px; }
        #qr-reader__camera_selection { background: #1e293b; color: white; border: 1px solid #334155; padding: 10px; border-radius: 12px; margin-bottom: 10px; width: 90%; outline: none; }
      `}</style>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  return (
    <div className="min-h-screen bg-[#10b981] text-white flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto w-full animate-in fade-in duration-500">
      <div className="bg-white text-green-500 p-8 rounded-full mb-8 shadow-2xl animate-bounce border-8 border-green-400/30">
        <CheckCircle size={100} strokeWidth={3} />
      </div>
      <h1 className="text-6xl font-black mb-12 italic tracking-tighter drop-shadow-lg">สำเร็จ!</h1>
      <div className="bg-black/10 p-8 rounded-[3rem] backdrop-blur-md mb-12 w-full border border-white/20">
         <p className="text-xs uppercase font-bold tracking-widest mb-2 opacity-80">ระบบหักคูปองแล้ว</p>
         <p className="text-7xl font-black">20<span className="text-4xl opacity-50 ml-2">฿</span></p>
      </div>
      <button onClick={onDone} className="bg-white text-green-600 w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all uppercase tracking-widest">
        กลับหน้าหลัก
      </button>
    </div>
  );
}