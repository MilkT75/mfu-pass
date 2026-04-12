"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut 
} from "firebase/auth";

import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, 
  onSnapshot, updateDoc, increment, serverTimestamp, query, where, getDocs
} from "firebase/firestore";

/* ==================== TYPES ==================== */
interface UserData {
  uid: string;
  email: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
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
const ADMIN_PASS = "mfupass1234";

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

  // Firebase Auth Listener
  useEffect(() => {
    const config = getFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL) {
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

    // Global Settings
    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
    }));

    // Student & Guest Data
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

    // Merchant Data
    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setRedemptions(snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => d.data()));
      }));
    }

    // Admin Data
    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter((d: any) => d.data().role === 'merchant' && d.data().isApproved === false).map((d: any) => ({ id: d.id, ...d.data() })));
      }));
    }

    return () => unsubs.forEach((unsub: any) => unsub());
  }, [user, currentView]);

  const handleAuthAction = async (email: string, pass: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e: any) {
      let msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      if (e.code === 'auth/email-already-in-use') msg = "อีเมลนี้มีผู้ใช้งานแล้ว";
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') msg = "ไม่พบบัญชีผู้ใช้ หรือรหัสผ่านผิด";
      alert(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = () => signOut(getAuth());

  const handleRoleSelect = async (role: string) => {
    if (!user) return;
    setIsActionLoading(true);
    const db = getFirestore();
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      role,
      isApproved: role !== 'merchant',
      createdAt: serverTimestamp()
    }, { merge: true });
    setCurrentView(role);
    setIsActionLoading(false);
  };

  // --- RENDER CONTROLLER ---
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <div className="flex flex-col items-center animate-pulse">
           <Ticket className="w-16 h-16 text-indigo-600 mb-4" />
           <p className="text-indigo-900 font-bold tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (currentView === 'auth') return <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} user={user} />;
  if (currentView === 'admin') return <AdminDashboardView allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={handleLogout} />;
  if (currentView === 'student' || currentView === 'guest') return <StudentDashboardView user={user} userData={userData} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} />;
  if (currentView === 'merchant') return <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} onLogout={handleLogout} />;
  if (currentView === 'buy_pass') return <BuyPassView settings={systemSettings} onBack={() => setCurrentView(userData?.role || 'student')} user={user} />;
  if (currentView === 'scan_qr') return <ScanQRView onBack={() => setCurrentView(userData?.role || 'student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} />;
  if (currentView === 'success') return <SuccessView onDone={() => setCurrentView(userData?.role || 'student')} />;

  return null;
}

/* ==================== SUB COMPONENTS (iOS Style & Robust) ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user }: any) {
  return (
    <div className={`bg-${color}-600 text-white px-6 py-10 md:py-12 rounded-b-[3rem] shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full transition-all duration-500`}>
      <div className="absolute -right-8 -top-8 opacity-10 rotate-12 pointer-events-none">
        <Ticket size={180} />
      </div>
      <div className="flex justify-between items-start relative z-10">
        <div className="animate-in slide-in-from-left duration-500">
          <h2 className="text-4xl font-black italic tracking-tighter">{title}</h2>
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">{subtitle}</p>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-3 rounded-2xl transition-all active:scale-95">
            <LogOut size={20} />
          </button>
        )}
      </div>
      {user && (
        <div className="mt-8 bg-black/10 backdrop-blur-sm rounded-2xl p-4 flex items-center justify-between text-xs border border-white/10 animate-in fade-in duration-700">
          <div className="font-mono truncate max-w-[200px] text-white/90">ID: {user.uid}</div>
          <button 
            onClick={() => { navigator.clipboard.writeText(user.uid); alert("คัดลอกรหัสเรียบร้อย"); }}
            className="bg-white/20 px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors flex items-center gap-1 font-bold"
          >
            <Copy size={12} /> COPY
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100 p-8 ${className}`}>{children}</div>;
}

/* Auth Screen */
function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading, user }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (!email.includes("@") || !email.includes(".")) return setLocalError("รูปแบบอีเมลไม่ถูกต้อง");
    if (password.length < 6) return setLocalError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    
    onAuth(email, password);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-8 md:p-10 animate-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-indigo-200 shadow-xl mb-6">
            <Ticket size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Digital Wallet</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4 animate-in slide-in-from-bottom-8">
            <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest mb-6">เลือกบทบาทของคุณ</p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {localError && <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-xs font-bold text-center animate-bounce">{localError}</div>}
            
            <div className="bg-slate-50 rounded-3xl p-2 border border-slate-100 shadow-inner">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input type="email" placeholder="อีเมล (Email)" value={email} onChange={(e: any) => setEmail(e.target.value)}
                  className="w-full pl-14 pr-4 py-4 rounded-2xl bg-transparent outline-none font-bold text-slate-700" required />
              </div>
              <div className="h-[1px] bg-slate-200 mx-4"></div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                <input type={showPassword ? "text" : "password"} placeholder="รหัสผ่าน (6 ตัวขึ้นไป)" value={password} onChange={(e: any) => setPassword(e.target.value)}
                  className="w-full pl-14 pr-12 py-4 rounded-2xl bg-transparent outline-none font-bold text-slate-700" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500">
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>
            </div>

            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[2rem] text-lg active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-100">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={22} /> : <UserPlus size={22} />)}
              {authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิกใหม่'}
            </button>

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-indigo-500 transition-colors">
              {authMode === 'login' ? 'ยังไม่มีบัญชี? สร้างบัญชี' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white border border-slate-100 hover:border-indigo-500 p-5 rounded-3xl flex items-center gap-6 active:scale-95 transition-all shadow-[0_5px_20px_rgba(0,0,0,0.03)] group">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors`}>{icon}</div>
      <div className="font-black text-xl text-slate-800">{title}</div>
    </button>
  );
}

/* Admin Dashboard */
function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout }: any) {
  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const [promptPayQr, setPromptPayQr] = useState(systemSettings.promptPayQr || "");
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: any) => s.status === 'pending');
  const totalPending = pendingSlips.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'global'), { pricePerSet, promptPayQr }, { merge: true });
    alert("บันทึกการตั้งค่าเรียบร้อยแล้ว");
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
    } catch(err) {
      alert("เกิดข้อผิดพลาดในการอนุมัติ");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8 md:px-8 font-sans w-full mx-auto pb-20">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-indigo-400 italic">Admin Console</h1>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mt-1">Super User 100%</p>
          </div>
          <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20"><LogOut size={20} /></button>
        </div>

        {/* System Settings */}
        <div className="bg-slate-900 rounded-[2.5rem] p-8 mb-10 border border-slate-800 shadow-2xl">
          <h3 className="font-bold text-indigo-300 mb-6 flex items-center gap-2"><Settings size={18} /> ตั้งค่าระบบ</h3>
          <div className="mb-6">
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">ราคา 1 เซ็ต (ได้ 5 คูปอง)</p>
            <input type="number" value={pricePerSet} onChange={(e: any) => setPricePerSet(Number(e.target.value))} 
              className="w-full bg-black/50 text-4xl font-black rounded-2xl p-5 outline-none border border-slate-700 focus:border-indigo-500 transition-all text-indigo-100" />
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">PromptPay QR Code (Image URL/Base64)</p>
            <textarea value={promptPayQr} onChange={(e: any) => setPromptPayQr(e.target.value)} rows={3}
              className="w-full bg-black/50 rounded-2xl p-5 text-xs font-mono outline-none resize-none border border-slate-700 focus:border-indigo-500 text-slate-300" placeholder="https://..." />
            {promptPayQr && <img src={promptPayQr} className="mt-4 h-40 object-contain rounded-2xl" alt="QR Preview" />}
          </div>
          <button onClick={saveSettings} className="w-full mt-8 bg-indigo-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all active:scale-95">
            <Save size={18} /> บันทึกการตั้งค่า
          </button>
        </div>

        {/* Pending Slips */}
        <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-4 px-2">สลิปที่รอตรวจสอบ ({pendingSlips.length})</h3>
        {pendingSlips.length === 0 ? <p className="text-slate-600 italic px-2 mb-10">ไม่มีรายการใหม่</p> : pendingSlips.map((slip: PurchaseSlip) => (
          <div key={slip.id} className="bg-slate-900 rounded-[2.5rem] p-6 mb-6 border border-slate-800">
            <div className="flex justify-between items-center text-xs mb-4 bg-black/40 p-4 rounded-2xl">
              <span className="font-mono text-slate-400">{slip.studentUid.slice(0,10)}...</span>
              <span className="font-black text-indigo-400 text-base">เซ็ต {slip.numSets} ({slip.totalAmount}฿)</span>
            </div>
            <img src={slip.slipUrl} className="w-full rounded-3xl mb-6 aspect-[3/4] object-cover border border-slate-700" alt="slip" />
            <div className="flex gap-4">
              <button onClick={() => handleApproveSlip(slip)} className="flex-1 bg-green-500 py-5 rounded-2xl font-black active:scale-95">✅ อนุมัติ</button>
              <button onClick={async () => await updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' })} className="flex-1 bg-red-600 py-5 rounded-2xl font-black active:scale-95">❌ ปฏิเสธ</button>
            </div>
          </div>
        ))}

        {/* Pending Merchants */}
        <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-4 px-2 mt-10">ร้านค้ารออนุมัติ ({allPendingMerchants.length})</h3>
        {allPendingMerchants.length === 0 ? <p className="text-slate-600 italic px-2">ไม่มีร้านค้าใหม่</p> : allPendingMerchants.map((m: any) => (
          <div key={m.id} className="bg-slate-900 rounded-3xl p-5 mb-4 border border-slate-800 flex justify-between items-center">
            <div className="truncate pr-4"><p className="font-bold text-indigo-200">{m.email}</p></div>
            <button onClick={async () => await updateDoc(doc(db, 'users', m.id), { isApproved: true })} className="bg-green-600 px-5 py-2 rounded-xl font-bold text-xs uppercase active:scale-95">Approve</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Student/Guest Dashboard */
function StudentDashboardView({ user, userData, activePass, pendingPurchase, onLogout, onBuyPass, onScan }: any) {
  const roleName = userData?.role === 'guest' ? 'Guest' : 'Student';
  
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-12 w-full">
      <Header title="My Wallet" subtitle={`${roleName}: ${user?.email}`} user={user} onLogout={onLogout} />
      <div className="px-4 md:px-6 flex-1 space-y-6 max-w-2xl mx-auto w-full -mt-8 animate-in slide-in-from-bottom-8 duration-700">
        
        {pendingPurchase && (
          <div className="bg-amber-100 rounded-[2rem] p-6 text-center border border-amber-200 shadow-sm animate-pulse">
             <Clock className="mx-auto text-amber-500 mb-2" size={32} />
             <h3 className="font-black text-amber-800">รอตรวจสอบสลิป ({pendingPurchase.numSets} เซ็ต)</h3>
             <p className="text-amber-700/70 text-xs mt-1 font-bold">แอดมินกำลังดำเนินการ โปรดรอสักครู่...</p>
          </div>
        )}

        <Card className="text-center flex flex-col items-center">
          {activePass && activePass.remainingCoupons > 0 ? (
            <div className="w-full">
              <div className="flex justify-between items-center w-full mb-6">
                <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Wallet size={24}/></div>
                <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></div> Active</div>
              </div>
              <p className="uppercase text-xs font-black text-slate-400 tracking-[0.2em] mb-2">คูปองคงเหลือ</p>
              <div className="text-[7rem] font-black leading-none text-slate-900 tracking-tighter">{activePass.remainingCoupons}</div>
              
              <div className="bg-indigo-50 text-indigo-700 py-2 px-6 rounded-full inline-flex items-center gap-2 mt-4 mb-10 font-black border border-indigo-100">
                <Sparkles size={16}/> มูลค่ารวม {activePass.remainingCoupons * 20} ฿
              </div>
              
              <div className="flex gap-3 w-full">
                <button onClick={onScan} className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-2">
                  <QrCode size={20}/> แสกนใช้
                </button>
                <button onClick={onBuyPass} className="flex-none bg-slate-100 text-indigo-600 font-black px-6 rounded-2xl active:scale-95 transition-all hover:bg-slate-200">
                  + ซื้อเพิ่ม
                </button>
              </div>
            </div>
          ) : (
            <div className="py-6">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Ticket size={40} className="text-slate-300"/></div>
              <h3 className="font-black text-2xl text-slate-800 mb-2">กระเป๋าว่างเปล่า</h3>
              <p className="text-slate-500 text-sm mb-8 px-4 leading-relaxed">ซื้อพาสใหม่เพื่อรับคูปองส่วนลด 5 ใบ (มูลค่า 100 บาท) ในราคาพิเศษ</p>
              <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg active:scale-95 shadow-xl shadow-indigo-100">ซื้อพาสใหม่</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* Buy Pass */
function BuyPassView({ settings, onBack, user }: any) {
  const [numSets, setNumSets] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const totalAmount = settings.pricePerSet * numSets;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return alert('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น');
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = async () => {
    if (!slip || !user) return alert("กรุณาอัปโหลดสลิป");
    setIsLoading(true);
    const db = getFirestore();
    await addDoc(collection(db, 'purchases'), {
      studentUid: user.uid,
      numSets,
      totalAmount,
      slipUrl: slip,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    alert(`ส่งสลิปยอด ${totalAmount} บาท เรียบร้อยแล้ว แอดมินกำลังตรวจสอบครับ`);
    setIsLoading(false);
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 md:p-8 max-w-2xl mx-auto w-full font-sans">
      <button onClick={onBack} className="flex items-center gap-2 mb-6 text-slate-500 font-medium"><ChevronLeft size={24} />กลับ</button>
      <h2 className="text-4xl font-black mb-8">ซื้อพาส</h2>

      <Card className="mb-8">
        <div className="flex justify-center items-center gap-8 my-8">
          <button onClick={() => setNumSets((n: number) => Math.max(1, n-1))} className="text-4xl font-black w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">-</button>
          <div className="text-7xl font-black">{numSets}</div>
          <button onClick={() => setNumSets((n: number) => n+1)} className="text-4xl font-black w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">+</button>
        </div>
        <p className="text-center text-4xl font-black">ยอดที่ต้องโอน: <span className="text-indigo-600">{totalAmount}</span> บาท</p>
      </Card>

      {settings.promptPayQr && (
        <Card className="mb-8 p-4">
          <img src={settings.promptPayQr} className="w-full rounded-3xl" alt="QR" />
        </Card>
      )}

      <Card>
        <label className="border-2 border-dashed border-slate-300 rounded-3xl h-72 md:h-80 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50">
          {slip ? <img src={slip} className="max-h-full rounded-3xl" alt="slip" /> : <Upload size={80} className="text-slate-300" />}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </Card>

      <button onClick={handleConfirm} disabled={!slip} className="mt-10 w-full bg-indigo-600 text-white font-black py-7 rounded-3xl text-xl active:scale-95 disabled:opacity-50">
        ส่งสลิปยืนยัน
      </button>
    </div>
  );
}

/* Merchant Dashboard */
function MerchantDashboardView({ user, redemptions, onLogout }: any) {
  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans max-w-2xl mx-auto w-full pb-12">
      <Header title="Shop Center" subtitle={`ID: ${user?.uid?.slice(0,8)}`} color="orange" onLogout={onLogout} user={user} />
      <div className="px-6 -mt-8 flex-1">
        <Card>
          <p className="text-7xl font-black text-orange-500 text-center">{redemptions.length}</p>
          <p className="text-center text-orange-600 font-medium mt-3">ครั้งที่ใช้สิทธิ์วันนี้</p>
        </Card>
      </div>
    </div>
  );
}

/* Scan QR View */
function ScanQRView({ onBack, activePass, user, onSuccess }: any) {
  const [shopId, setShopId] = useState("");
  const handleRedeem = async () => {
    if (!shopId || !activePass) return;
    const db = getFirestore();
    await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
    await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: shopId, amount: 20, redeemedAt: new Date().toISOString() });
    onSuccess();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
      <h2 className="text-3xl font-black mb-10">REDEEM COUPON</h2>
      <div className="w-full max-w-xs aspect-square border-4 border-indigo-500 rounded-3xl flex items-center justify-center bg-black mb-12">
        <Camera size={100} className="text-slate-600" />
      </div>
      <input type="text" placeholder="กรอก Shop ID" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
        className="w-full bg-slate-900 text-center text-2xl font-mono p-6 rounded-3xl border border-slate-700 outline-none" />
      <button onClick={handleRedeem} className="mt-10 w-full bg-indigo-600 py-6 rounded-3xl font-black text-lg">ยืนยันการใช้คูปอง</button>
      <button onClick={onBack} className="mt-12 text-slate-400">ยกเลิก</button>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  return (
    <div className="min-h-screen bg-green-500 text-white flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto w-full">
      <CheckCircle size={140} className="mb-8" />
      <h1 className="text-6xl font-black mb-6">สำเร็จ!</h1>
      <button onClick={onDone} className="bg-white text-green-600 px-14 py-7 rounded-3xl font-black text-2xl">กลับหน้าหลัก</button>
    </div>
  );
}