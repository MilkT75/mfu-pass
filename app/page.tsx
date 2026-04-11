"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn,
  Users, Info, Sparkles, Image as ImageIcon, Settings, Save, RefreshCw
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  Unsubscribe, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  signInWithCustomToken,
  signInAnonymously
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  increment, 
  serverTimestamp 
} from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 3.2 (Vercel Build Fix + Admin QR Config + Full Logic)
 */

// --- Admin Credentials (กำหนดได้ที่นี่) ---
const ADMIN_EMAIL = "admin@mfupass.com";
const ADMIN_PASS = "mfupass1234";

// --- Firebase Config Handler (รองรับทั้ง Vercel และ Canvas) ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_setup'>('login');
  const [currentView, setCurrentView] = useState<'auth' | 'student' | 'merchant' | 'admin' | 'guest' | 'buy_pass' | 'scan_qr' | 'success'>('auth');
  
  // Data States
  const [userData, setUserData] = useState<any>(null);
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [allPendingMerchants, setAllPendingMerchants] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>({ promptPayQr: null, price: 79 });
  const [currentTime, setCurrentTime] = useState(new Date());

  // 1. Auth Initialization
  useEffect(() => {
    const config = getFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL) {
          setCurrentView('admin');
        } else {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists() && userSnap.data().role) {
            setUserData(userSnap.data());
            setCurrentView(userSnap.data().role);
          } else {
            setAuthMode('role_setup');
            setCurrentView('auth');
          }
        }
      } else {
        setCurrentView('auth');
        setAuthMode('login');
      }
      setIsAppReady(true);
    });

    return () => unsubscribe();
  }, []);

  // 2. Data Listeners (Real-time)
  useEffect(() => {
    if (!user || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    // System Settings
    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data());
    }));

    // Data based on view
    if (['student', 'guest', 'buy_pass', 'scan_qr'].includes(currentView)) {
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        const myPass = snap.docs.find(d => d.data().studentUid === user.uid && d.data().remainingCoupons > 0);
        setActivePass(myPass ? { id: myPass.id, ...myPass.data() } : null);
      }));
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        const myPending = snap.docs.find(d => d.data().studentUid === user.uid && d.data().status === 'pending');
        setPendingPurchase(myPending ? { id: myPending.id, ...myPending.data() } : null);
      }));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setRedemptions(snap.docs.filter(d => d.data().merchantId === user.uid).map(d => d.data()));
      }));
      unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => setUserData(snap.data())));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.filter(d => d.data().status === 'pending').map(d => ({ id: d.id, ...d.data() })));
      }));
      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter(d => d.data().role === 'merchant' && d.data().isApproved === false).map(d => ({ id: d.id, ...d.data() })));
      }));
    }

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { unsubs.forEach(f => f()); clearInterval(timer); };
  }, [user, currentView]);

  // Handlers
  const handleAuth = async (emailInput: string, passInput: string) => {
    setIsActionLoading(true);
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(getAuth(), emailInput, passInput);
      } else {
        await signInWithEmailAndPassword(getAuth(), emailInput, passInput);
      }
    } catch (e: any) { alert(e.message); }
    setIsActionLoading(false);
  };

  const handleLogout = () => {
    signOut(getAuth());
    setUserData(null);
  };

  const handleRoleSelect = async (role: string) => {
    setIsActionLoading(true);
    const db = getFirestore();
    const data = { 
      uid: user.uid, 
      email: user.email, 
      role, 
      isApproved: role !== 'merchant', 
      createdAt: serverTimestamp() 
    };
    await setDoc(doc(db, 'users', user.uid), data, { merge: true });
    setIsActionLoading(false);
  };

  // ============================================================================
  // RENDER LOGIC
  // ============================================================================

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-[1.2rem] flex items-center justify-center shadow-2xl animate-bounce">
            <Ticket className="text-white" size={32} />
          </div>
          <p className="text-indigo-950 font-black text-xl tracking-tighter animate-pulse uppercase">MFU Pass</p>
        </div>
      </div>
    );
  }

  if (currentView === 'auth') {
    return <AuthScreenView 
      authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuth} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} 
    />;
  }

  if (currentView === 'admin') {
    return <AdminDashboardView 
      allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={handleLogout} isActionLoading={isActionLoading}
    />;
  }

  if (currentView === 'student' || currentView === 'guest') {
    return <StudentDashboardView 
      user={user} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')}
    />;
  }

  if (currentView === 'merchant') {
    return <MerchantDashboardView 
      user={user} userData={userData} redemptions={redemptions} onLogout={handleLogout}
    />;
  }

  if (currentView === 'buy_pass') {
    return <BuyPassView 
      settings={systemSettings} onBack={() => setCurrentView('student')} isActionLoading={isActionLoading}
      onConfirm={async (slip) => {
        setIsActionLoading(true);
        await addDoc(collection(getFirestore(), 'purchases'), { studentUid: user.uid, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
        setIsActionLoading(false);
        setCurrentView('student');
      }}
    />;
  }

  if (currentView === 'scan_qr') {
    return <ScanQRView 
      onBack={() => setCurrentView('student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')}
    />;
  }

  if (currentView === 'success') {
    return <SuccessView onDone={() => setCurrentView('student')} currentTime={currentTime} />;
  }

  return null;
}

// ============================================================================
// SUB-COMPONENTS (Outside to fix Focus/Input bugs)
// ============================================================================

function Header({ title, subtitle, color = "indigo", onLogout }: any) {
  return (
    <div className={`bg-${color}-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden mb-8`}>
      <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={240}/></div>
      <div className="relative z-10 flex justify-between items-start">
        <div className="animate-in slide-in-from-left duration-500">
          <h2 className="text-4xl font-black italic tracking-tighter">{title}</h2>
          <p className={`text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2 truncate max-w-[200px]`}>{subtitle}</p>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 active:scale-90 transition-all">
            <LogOut size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return (
    <div className={`bg-white rounded-[3rem] shadow-[0_10px_50px_rgba(0,0,0,0.04)] border border-slate-100 p-8 ${className}`}>
      {children}
    </div>
  );
}

function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[400px] animate-in fade-in zoom-in duration-700">
        <div className="flex flex-col items-center mb-12">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-100 mb-6 rotate-3">
            <Ticket size={48} className="text-white" strokeWidth={2.5}/>
          </div>
          <h1 className="text-5xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mt-3">Digital Coupons</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4">
            <p className="text-center font-bold text-slate-500 mb-8 uppercase text-[10px] tracking-widest">ยินดีต้อนรับ! โปรดระบุตัวตนของคุณ</p>
            <RoleButton icon={<User/>} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users/>} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store/>} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onAuth(email, password); }} className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-3 shadow-sm border border-slate-200 overflow-hidden">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20}/>
                <input 
                  type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-bold text-slate-800 bg-transparent text-lg" required 
                />
              </div>
              <div className="h-[1px] bg-slate-100 mx-6"></div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20}/>
                <input 
                  type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-bold text-slate-800 bg-transparent text-lg" required 
                />
              </div>
            </div>
            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3 text-xl">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={24}/> : <UserPlus size={24}/>)}
              {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest mt-6 hover:text-indigo-600 transition-colors">
              {authMode === 'login' ? 'สมัครสมาชิกใหม่' : 'กลับไปหน้าล็อกอิน'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white p-7 rounded-[2.5rem] flex items-center gap-6 border-2 border-transparent hover:border-indigo-600 transition-all shadow-sm group active:scale-95">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600 group-hover:bg-indigo-600 group-hover:text-white transition-all`}>{icon}</div>
      <div className="text-left font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout, isActionLoading }: any) {
  const [qrText, setQrText] = useState(systemSettings.promptPayQr || "");
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans pb-32 overflow-y-auto">
      <div className="flex justify-between items-center mb-12 pt-6">
        <div>
          <h2 className="text-3xl font-black text-indigo-400 italic tracking-tighter">Admin Console</h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">System Controller 100%</p>
        </div>
        <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl"><LogOut size={20}/></button>
      </div>

      <div className="space-y-12">
        {/* Section: Config */}
        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Settings size={14}/> System Settings</h3>
          <Card className="bg-slate-900 border-slate-800 text-white p-8">
             <p className="text-sm font-bold mb-4 flex items-center gap-2 text-indigo-300"><ImageIcon size={16}/> PromptPay QR Config</p>
             <textarea 
               value={qrText} onChange={e => setQrText(e.target.value)}
               placeholder="Paste Image URL or Base64 here"
               className="w-full bg-black/50 border border-slate-700 rounded-2xl p-5 text-xs font-mono mb-6 h-32 outline-none focus:border-indigo-500 transition-all text-indigo-200"
             />
             <button 
               onClick={async () => {
                 await setDoc(doc(getFirestore(), 'settings', 'global'), { promptPayQr: qrText }, { merge: true });
                 alert("Settings Saved Successfully!");
               }}
               className="w-full bg-indigo-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/50 active:scale-95 transition-all"
             >
               <Save size={20}/> UPDATE SYSTEM QR
             </button>
          </Card>
        </section>

        {/* Section: Slips */}
        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Pending Slips ({allPendingSlips.length})</h3>
          <div className="space-y-6">
            {allPendingSlips.length === 0 ? <p className="text-slate-800 italic">No tasks left</p> : allPendingSlips.map(s => (
              <div key={s.id} className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800 shadow-2xl">
                 <p className="text-[10px] font-mono text-slate-500 mb-4 truncate">Student ID: {s.studentUid}</p>
                 <img src={s.slipUrl} className="w-full rounded-[2rem] mb-6 aspect-[3/4] object-cover border border-slate-800" alt="slip"/>
                 <div className="flex gap-4">
                    <button onClick={() => {
                      updateDoc(doc(getFirestore(), 'purchases', s.id), { status: 'approved' });
                      addDoc(collection(getFirestore(), 'passes'), { studentUid: s.studentUid, remainingCoupons: 5, createdAt: new Date().toISOString() });
                    }} className="flex-1 bg-green-500 py-5 rounded-2xl font-black text-lg active:scale-95 transition-all">APPROVE</button>
                    <button onClick={() => updateDoc(doc(getFirestore(), 'purchases', s.id), { status: 'rejected' })} className="flex-1 bg-red-600 py-5 rounded-2xl font-black text-lg active:scale-95">REJECT</button>
                 </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Merchant Approval */}
        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">New Merchants ({allPendingMerchants.length})</h3>
          <div className="space-y-4">
            {allPendingMerchants.map(m => (
              <div key={m.id} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex justify-between items-center">
                 <div className="truncate pr-4"><p className="font-bold text-indigo-300">{m.email}</p><p className="text-[10px] opacity-30">{m.id}</p></div>
                 <button onClick={() => updateDoc(doc(getFirestore(), 'users', m.id), { isApproved: true })} className="bg-green-600 px-6 py-2 rounded-xl font-bold text-xs uppercase shadow-lg shadow-green-900/20">Grant Access</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StudentDashboardView({ user, activePass, pendingPurchase, onLogout, onBuyPass, onScan }: any) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-20">
      <Header title="My Wallet" subtitle={user?.email} onLogout={onLogout} />
      <div className="px-6 -mt-12 flex-1 space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        <Card className="flex flex-col items-center p-10">
           {activePass ? (
             <div className="w-full text-center">
               <div className="flex justify-between w-full mb-8">
                  <div className="bg-indigo-50 p-4 rounded-3xl text-indigo-600 shadow-inner"><Wallet size={28}/></div>
                  <div className="flex items-center gap-2 bg-green-50 px-4 rounded-full border border-green-100"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Ready</span></div>
               </div>
               <p className="text-slate-400 font-black text-[11px] uppercase tracking-[0.2em] mb-2">Available Coupons</p>
               <div className="flex items-baseline justify-center gap-3 mb-4 font-black">
                  <span className="text-9xl text-slate-900 tracking-tighter">{activePass.remainingCoupons}</span>
                  <span className="text-3xl text-slate-200">/ 5</span>
               </div>
               <p className="text-green-600 font-black text-lg mb-10 flex items-center justify-center gap-2 bg-green-50 py-2 rounded-2xl">
                 <Sparkles size={20}/> Value: {activePass.remainingCoupons * 20} THB
               </p>
               <button onClick={onScan} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl shadow-indigo-200 flex items-center justify-center gap-4 text-xl active:scale-95 transition-all">
                  <QrCode size={28}/> SCAN TO PAY
               </button>
             </div>
           ) : pendingPurchase ? (
             <div className="py-12 text-center">
                <Loader2 className="w-20 h-20 text-amber-500 animate-spin mx-auto mb-8" />
                <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Verifying Slip...</h3>
                <p className="text-slate-400 font-medium px-8">เรากำลังตรวจสอบการโอนเงินของคุณ โปรดรอสักครู่ครับ</p>
             </div>
           ) : (
             <div className="py-10 text-center w-full">
                <div className="w-28 h-28 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-8"><Ticket size={56}/></div>
                <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Empty Wallet</h3>
                <p className="text-slate-400 font-medium mb-10 px-6">ซื้อพาสส่วนลด 5 ใบ (มูลค่า 100.-) ในราคาเพียง 79.- สำหรับโรงอาหาร</p>
                <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl shadow-indigo-200 text-xl active:scale-95 transition-all">
                  GET PASS (79.-)
                </button>
             </div>
           )}
        </Card>
        <div className="grid grid-cols-2 gap-5">
           <Card className="flex flex-col items-center gap-3 opacity-30 grayscale p-8"><History size={32}/><p className="text-[10px] font-black tracking-widest">HISTORY</p></Card>
           <Card className="flex flex-col items-center gap-3 opacity-30 grayscale p-8"><Info size={32}/><p className="text-[10px] font-black tracking-widest">HELP</p></Card>
        </div>
      </div>
    </div>
  );
}

function MerchantDashboardView({ user, userData, redemptions, onLogout }: any) {
  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-20">
      <Header title="Shop Center" subtitle={`Store ID: ${user?.uid.slice(0, 8)}`} color="orange" onLogout={onLogout} />
      <div className="px-6 -mt-12 flex-1 space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        {!userData?.isApproved ? (
          <Card className="text-center py-16 border-4 border-dashed border-orange-200">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Waiting Approval</h3>
             <p className="text-slate-400 font-medium px-8">เจ้าหน้าที่กำลังตรวจสอบข้อมูลร้านค้าของคุณ โปรดกลับมาใหม่อีกครั้งในภายหลังครับ</p>
          </Card>
        ) : (
          <>
            <Card className="text-center border-none shadow-orange-100/60 p-12">
               <p className="text-slate-400 font-black text-xs uppercase mb-3 tracking-widest">Redeemed Today</p>
               <h2 className="text-9xl font-black text-orange-500 mb-8 tracking-tighter">{redemptions.length}</h2>
               <div className="bg-orange-600 text-white py-6 rounded-[2.5rem] shadow-2xl shadow-orange-200">
                  <p className="text-orange-100 text-[10px] font-black uppercase mb-1 tracking-widest">Total Revenue</p>
                  <p className="text-5xl font-black">{redemptions.length * 20} ฿</p>
               </div>
            </Card>
            <Card className="bg-white border-2 border-dashed border-orange-100 text-center">
               <p className="text-slate-400 font-bold text-xs uppercase mb-4 tracking-widest text-center">Your QR/Shop ID</p>
               <div className="bg-slate-50 p-5 rounded-2xl font-mono text-sm break-all font-bold text-orange-900 border border-orange-50 select-all">{user?.uid}</div>
               <p className="text-[10px] text-orange-300 mt-4 italic font-medium">ให้ลูกค้านำรหัสนี้ไปใส่ในหน้าแสกนครับ</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function BuyPassView({ settings, onBack, onConfirm, isActionLoading }: any) {
  const [slip, setSlip] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-[#F2F2F7] p-8 flex flex-col font-sans max-w-lg mx-auto w-full">
      <button onClick={onBack} className="mb-10 flex items-center gap-3 text-slate-400 font-black text-xs uppercase tracking-widest"><ChevronLeft size={20}/> Back</button>
      <h2 className="text-4xl font-black mb-10 italic tracking-tighter text-slate-900 animate-in fade-in duration-500">Purchase Pass</h2>
      
      <Card className="text-center mb-8 border-indigo-100 border-2 p-10">
        <p className="text-indigo-600 font-black text-[11px] uppercase tracking-[0.3em] mb-6">Payment Transfer (79.00 THB)</p>
        <div className="bg-slate-50 aspect-square rounded-[3rem] mb-8 flex items-center justify-center border-4 border-dashed border-slate-100 overflow-hidden shadow-inner p-4">
          {settings?.promptPayQr ? (
            <img src={settings.promptPayQr} className="w-full h-full object-contain animate-in zoom-in duration-700" alt="QR" />
          ) : (
            <div className="text-center p-10 opacity-20"><QrCode size={80} className="mx-auto mb-4"/><p className="text-xs font-bold uppercase tracking-widest">Admin hasn't set QR</p></div>
          )}
        </div>
        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Account: MFU PASS OFFICIAL</p>
      </Card>

      <Card className="flex-1 flex flex-col p-10">
        <p className="font-black text-slate-800 mb-6 text-xl tracking-tight text-center">อัปโหลดสลิปโอนเงิน</p>
        <label className="flex-1 border-4 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative transition-all group">
          {slip ? <img src={slip} className="w-full h-full object-cover" alt="preview"/> : (
             <div className="text-center"><Upload className="text-slate-200 mx-auto mb-4 group-hover:text-indigo-300 transition-colors" size={64}/><p className="text-slate-300 text-xs font-black uppercase tracking-widest">Tap to upload image</p></div>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={e => {
             const file = e.target.files?.[0];
             if (file) {
               const r = new FileReader();
               r.onloadend = () => setSlip(r.result as string);
               r.readAsDataURL(file);
             }
          }} />
        </label>
      </Card>
      <button onClick={() => onConfirm(slip)} disabled={!slip || isActionLoading} className="w-full bg-indigo-600 text-white font-black py-7 rounded-[2.5rem] shadow-2xl shadow-indigo-100 mt-10 disabled:opacity-30 active:scale-95 transition-all text-xl">
        {isActionLoading ? <RefreshCw className="animate-spin mx-auto"/> : 'CONFIRM & SEND'}
      </button>
    </div>
  );
}

function ScanQRView({ onBack, activePass, user, onSuccess }: any) {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center">
      <h2 className="text-3xl font-black mb-12 tracking-tighter italic text-indigo-400">REDEEM PASS</h2>
      <div className="w-full aspect-square border-4 border-indigo-500 rounded-[4rem] mb-12 relative flex items-center justify-center overflow-hidden bg-black shadow-[0_0_100px_rgba(99,102,241,0.2)]">
        <Camera size={100} className="text-slate-900" />
        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 animate-[scan_3s_ease-in-out_infinite] shadow-[0_0_30px_#6366f1]"></div>
        <style>{`
          @keyframes scan { 0% { top: 10%; } 50% { top: 90%; } 100% { top: 10%; } }
        `}</style>
      </div>
      <div className="w-full bg-slate-900 p-10 rounded-[3.5rem] border border-slate-800">
         <p className="text-xs font-black text-indigo-400 uppercase mb-5 text-center tracking-[0.3em]">Enter Shop ID Below</p>
         <input 
           type="text" placeholder="PASTE MERCHANT ID" 
           autoFocus
           onKeyDown={async (e: any) => {
             if (e.key === 'Enter') {
               const val = e.target.value;
               if (val && activePass?.remainingCoupons > 0) {
                 const db = getFirestore();
                 await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
                 await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: val, amount: 20, redeemedAt: new Date().toISOString() });
                 onSuccess();
               }
             }
           }} 
           className="w-full bg-black/50 p-6 rounded-3xl text-center font-mono text-2xl text-indigo-300 border border-slate-800 outline-none focus:border-indigo-500 transition-all shadow-inner"
         />
         <p className="text-[10px] text-slate-600 text-center mt-6 font-bold uppercase tracking-widest">Press Enter to Confirm Payment</p>
      </div>
      <button onClick={onBack} className="mt-12 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors">Cancel Payment</button>
    </div>
  );
}

function SuccessView({ onDone, currentTime }: any) {
  return (
    <div className="min-h-screen bg-green-500 text-white p-12 flex flex-col items-center justify-center text-center animate-in fade-in duration-1000">
      <div className="bg-white text-green-500 p-10 rounded-full mb-12 shadow-2xl animate-bounce">
        <CheckCircle size={120} strokeWidth={3}/>
      </div>
      <h1 className="text-7xl font-black mb-8 italic tracking-tighter shadow-green-600 drop-shadow-xl">PAID!</h1>
      <div className="bg-black/10 p-10 rounded-[4rem] backdrop-blur-xl mb-16 w-full max-w-sm border border-white/20 shadow-2xl">
        <p className="text-xs uppercase font-black tracking-widest mb-3 opacity-60">Coupon Successfully Redeemed</p>
        <p className="text-7xl font-black tracking-tight">20 THB</p>
      </div>
      <p className="text-7xl font-mono font-black tracking-tighter mb-24 opacity-80">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
      <button onClick={onDone} className="w-full bg-white text-green-600 font-black py-7 rounded-[2.5rem] text-2xl shadow-2xl active:scale-95 hover:bg-green-50 transition-all uppercase tracking-widest">Done</button>
    </div>
  );
}