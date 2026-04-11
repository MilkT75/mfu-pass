"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn,
  Users, Info, Sparkles, Image as ImageIcon, Settings, Save, RefreshCw,
  ChevronRight, ExternalLink
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  Unsubscribe, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  signInWithCustomToken
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
 * เวอร์ชัน: 3.6 (Final Structural Fix + Auth Safety + iOS Design)
 * ----------------------------------------------------------------------------
 * วิธีแก้ปัญหา 'invalid-credential' สำหรับ Admin:
 * 1. ในครั้งแรกที่ใช้งาน ให้กด "สมัครสมาชิกใหม่" (Sign Up) 
 * 2. กรอก admin@mfupass.com และรหัสผ่านที่ตั้งไว้
 * 3. เมื่อสมัครเสร็จ ระบบจะจำบทบาท Admin และใช้งานได้ทันทีในครั้งถัดไป
 * ----------------------------------------------------------------------------
 */

// --- Types & Interfaces ---
interface UserData {
  uid: string;
  email: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
}

interface AppSettings {
  promptPayQr: string | null;
  price: number;
}

// --- Admin Credentials ---
const ADMIN_EMAIL = "admin@mfupass.com";

// --- Firebase Configuration ---
const getFirebaseConfig = () => {
  if (typeof (window as any).__firebase_config !== 'undefined') {
    return JSON.parse((window as any).__firebase_config);
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
  const [currentView, setCurrentView] = useState<string>('auth');
  
  // States
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [allPendingMerchants, setAllPendingMerchants] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<AppSettings>({ promptPayQr: null, price: 79 });

  // 1. Initial Connection & Auth Listener
  useEffect(() => {
    const config = getFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const initAuth = async () => {
      const token = (window as any).__initial_auth_token;
      if (token) await signInWithCustomToken(auth, token);
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
            setUserData(userSnap.data() as UserData);
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

  // 2. Real-time Data Listeners
  useEffect(() => {
    if (!user || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    // Global Settings
    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
    }));

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
      unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => setUserData(snap.data() as UserData)));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.filter(d => d.data().status === 'pending').map(d => ({ id: d.id, ...d.data() })));
      }));
      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter(d => d.data().role === 'merchant' && d.data().isApproved === false).map(d => ({ id: d.id, ...d.data() })));
      }));
    }

    return () => unsubs.forEach(f => f());
  }, [user, currentView]);

  // --- Main Handlers ---
  const onAuth = async (emailInput: string, passInput: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, emailInput, passInput);
      } else {
        await signInWithEmailAndPassword(auth, emailInput, passInput);
      }
    } catch (e: any) { 
      let msg = e.message;
      if (e.code === 'auth/invalid-credential') msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง (หากเป็นแอดมินครั้งแรก โปรดเลือกสมัครสมาชิกก่อนครับ)";
      alert(msg); 
    } finally {
      setIsActionLoading(false);
    }
  };

  const onLogout = () => {
    signOut(getAuth());
    setUserData(null);
  };

  const onRoleSelect = async (role: string) => {
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
  // RENDER CONTROLLER
  // ============================================================================

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl animate-bounce">
            <Ticket className="text-white" size={32} />
          </div>
          <p className="text-indigo-950 font-black text-xl tracking-tighter uppercase animate-pulse">MFU Pass</p>
        </div>
      </div>
    );
  }

  // --- View Switcher ---
  if (currentView === 'auth') {
    return <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={onAuth} onRoleSelect={onRoleSelect} isActionLoading={isActionLoading} />;
  }

  if (currentView === 'admin') {
    return <AdminDashboardView allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={onLogout} />;
  }

  if (currentView === 'student' || currentView === 'guest') {
    return <StudentDashboardView user={user} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={onLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} />;
  }

  if (currentView === 'merchant') {
    return <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} onLogout={onLogout} />;
  }

  if (currentView === 'buy_pass') {
    return (
      <BuyPassView 
        settings={systemSettings} 
        onBack={() => setCurrentView('student')} 
        isActionLoading={isActionLoading}
        onConfirm={async (slip: string) => {
          setIsActionLoading(true);
          try {
            await addDoc(collection(getFirestore(), 'purchases'), { studentUid: user.uid, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
            setCurrentView('student');
          } catch (e) { alert(e); }
          setIsActionLoading(false);
        }}
      />
    );
  }

  if (currentView === 'scan_qr') {
    return <ScanQRView onBack={() => setCurrentView('student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} />;
  }

  if (currentView === 'success') {
    return <SuccessView onDone={() => setCurrentView('student')} />;
  }

  return null;
}

// ============================================================================
// UI COMPONENTS (Moved Outside for Stability)
// ============================================================================

function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuth(email, password);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[400px] animate-in fade-in duration-1000">
        <div className="flex flex-col items-center mb-12">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.2rem] flex items-center justify-center shadow-2xl mb-6 rotate-3 shadow-indigo-100">
            <Ticket size={48} className="text-white" strokeWidth={2.5}/>
          </div>
          <h1 className="text-5xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mt-3">Digital Coupons</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4 animate-in slide-in-from-bottom-8 duration-700">
            <p className="text-center font-bold text-slate-500 mb-8 uppercase text-[10px] tracking-widest">ยินดีต้อนรับ! โปรดระบุตัวตนของคุณ</p>
            <RoleButton icon={<User/>} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users/>} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store/>} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
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
            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3 text-xl disabled:opacity-50">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={24}/> : <UserPlus size={24}/>)}
              {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest mt-6 text-center hover:text-indigo-600 transition-colors">
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
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner`}>{icon}</div>
      <div className="text-left font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout }: any) {
  const [qrText, setQrText] = useState(systemSettings.promptPayQr || "");
  const db = getFirestore();

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans pb-32 overflow-y-auto">
      <div className="flex justify-between items-center mb-12 pt-6">
        <div>
          <h2 className="text-3xl font-black text-indigo-400 italic tracking-tighter">Admin Panel</h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">System Controller 100%</p>
        </div>
        <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 active:scale-90"><LogOut size={20}/></button>
      </div>

      <div className="space-y-12">
        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><Settings size={14}/> Settings</h3>
          <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800 shadow-2xl">
             <p className="text-sm font-bold mb-4 text-indigo-300 flex items-center gap-2"><ImageIcon size={16}/> PromptPay QR Config</p>
             <textarea 
               value={qrText} onChange={e => setQrText(e.target.value)}
               placeholder="Paste Image URL or Base64 data here"
               className="w-full bg-black/50 border border-slate-700 rounded-2xl p-5 text-xs font-mono mb-6 h-32 outline-none focus:border-indigo-500 text-indigo-200 transition-all"
             />
             <button 
               onClick={async () => {
                 await setDoc(doc(db, 'settings', 'global'), { promptPayQr: qrText }, { merge: true });
                 alert("Settings Updated!");
               }}
               className="w-full bg-indigo-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all shadow-indigo-900/40"
             >
               <Save size={20}/> SAVE GLOBAL QR
             </button>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Pending Slips ({allPendingSlips.length})</h3>
          <div className="space-y-6">
            {allPendingSlips.length === 0 ? <p className="text-slate-800 italic text-sm">No pending payments</p> : allPendingSlips.map(s => (
              <div key={s.id} className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800 shadow-2xl animate-in slide-in-from-bottom-4">
                 <p className="text-[10px] font-mono text-slate-500 mb-4 truncate">User: {s.studentUid}</p>
                 <img src={s.slipUrl} className="w-full rounded-[2rem] mb-6 aspect-[3/4] object-cover border border-slate-800 shadow-inner" alt="slip"/>
                 <div className="flex gap-4">
                    <button onClick={async () => {
                      await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
                      await addDoc(collection(db, 'passes'), { studentUid: s.studentUid, remainingCoupons: 5, createdAt: new Date().toISOString() });
                    }} className="flex-1 bg-green-500 py-5 rounded-2xl font-black text-lg active:scale-95 transition-all">APPROVE</button>
                    <button onClick={() => updateDoc(doc(db, 'purchases', s.id), { status: 'rejected' })} className="flex-1 bg-red-600 py-5 rounded-2xl font-black text-lg active:scale-95">REJECT</button>
                 </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Pending Merchants ({allPendingMerchants.length})</h3>
          <div className="space-y-4">
            {allPendingMerchants.map(m => (
              <div key={m.id} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex justify-between items-center animate-in fade-in">
                 <div className="truncate pr-4"><p className="font-bold text-indigo-300">{m.email}</p><p className="text-[10px] opacity-30">{m.id}</p></div>
                 <button onClick={() => updateDoc(doc(db, 'users', m.id), { isApproved: true })} className="bg-green-600 px-6 py-2 rounded-xl font-bold text-xs uppercase shadow-lg shadow-green-900/20 active:scale-95 transition-all">Approve</button>
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
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-20 overflow-x-hidden">
      <div className="bg-indigo-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden mb-8">
        <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={240}/></div>
        <div className="relative z-10 flex justify-between items-start">
          <div className="animate-in slide-in-from-left duration-700">
            <h2 className="text-4xl font-black italic tracking-tighter text-white">My Wallet</h2>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2 truncate max-w-[200px]">{user?.email}</p>
          </div>
          <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 active:scale-90 transition-all backdrop-blur-md border border-white/20"><LogOut size={20}/></button>
        </div>
      </div>

      <div className="px-6 -mt-12 flex-1 space-y-8 animate-in slide-in-from-bottom-12 duration-1000">
        <div className="bg-white rounded-[3.5rem] shadow-[0_10px_60px_rgba(0,0,0,0.04)] border border-slate-100 p-10 relative overflow-hidden flex flex-col items-center">
           {activePass ? (
             <div className="w-full text-center">
               <div className="flex justify-between w-full mb-8">
                  <div className="bg-indigo-50 p-4 rounded-3xl text-indigo-600 shadow-inner"><Wallet size={28}/></div>
                  <div className="flex items-center gap-2 bg-green-50 px-4 rounded-full border border-green-100 h-fit py-1"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Active</span></div>
               </div>
               <p className="text-slate-400 font-black text-[11px] uppercase tracking-[0.2em] mb-2">คูปองที่ใช้ได้</p>
               <div className="flex items-baseline justify-center gap-3 mb-4 font-black">
                  <span className="text-9xl text-slate-900 tracking-tighter">{activePass.remainingCoupons}</span>
                  <span className="text-3xl text-slate-200">/ 5</span>
               </div>
               <div className="bg-green-50 py-3 px-6 rounded-2xl mb-10 inline-flex items-center gap-3 border border-green-100 shadow-sm animate-in zoom-in duration-500 delay-300">
                 <Sparkles className="text-green-500 fill-green-500/20" size={20}/>
                 <p className="text-green-700 font-black text-xl uppercase tracking-tighter">มูลค่า {activePass.remainingCoupons * 20} บาท</p>
               </div>
               <button onClick={onScan} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl shadow-indigo-200 flex items-center justify-center gap-4 text-xl active:scale-95 transition-all">
                  <QrCode size={28}/> SCAN TO PAY
               </button>
             </div>
           ) : pendingPurchase ? (
             <div className="py-12 text-center w-full animate-in fade-in">
                <Loader2 className="w-20 h-20 text-amber-500 animate-spin mx-auto mb-8 opacity-80" />
                <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Verifying Slip...</h3>
                <p className="text-slate-400 font-medium px-8 leading-relaxed text-center">เรากำลังตรวจสอบยอดเงินของคุณ โปรดรอประมาณ 5-10 นาทีครับ</p>
             </div>
           ) : (
             <div className="py-10 text-center w-full animate-in zoom-in duration-500">
                <div className="w-28 h-28 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner"><Ticket size={56}/></div>
                <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight text-center">Wallet Empty</h3>
                <p className="text-slate-400 font-medium mb-10 px-6 leading-relaxed text-center italic">ซื้อพาสส่วนลด 5 ใบ (มูลค่า 100.-) ในราคาเพียง 79.- เพื่อรับส่วนลดอาหารมื้อละ 20 บาท</p>
                <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl shadow-indigo-100 text-xl active:scale-95 transition-all uppercase tracking-widest">
                  Buy Pass (79.-)
                </button>
             </div>
           )}
        </div>
        <div className="grid grid-cols-2 gap-5">
           <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 flex flex-col items-center gap-3 opacity-30 grayscale"><History size={32}/><p className="text-[10px] font-black tracking-widest">HISTORY</p></div>
           <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 flex flex-col items-center gap-3 opacity-30 grayscale"><Info size={32}/><p className="text-[10px] font-black tracking-widest">HELP</p></div>
        </div>
      </div>
    </div>
  );
}

function MerchantDashboardView({ user, userData, redemptions, onLogout }: any) {
  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-20">
      <div className="bg-orange-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden mb-8">
        <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={240}/></div>
        <div className="relative z-10 flex justify-between items-start">
          <div className="animate-in slide-in-from-left duration-700">
            <h2 className="text-4xl font-black italic tracking-tighter text-white">Shop Center</h2>
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2 truncate max-w-[200px]">ID: {user?.uid?.slice(0, 8)}</p>
          </div>
          <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 active:scale-90 transition-all border border-white/20"><LogOut size={20}/></button>
        </div>
      </div>

      <div className="px-6 -mt-12 flex-1 space-y-8 animate-in slide-in-from-bottom-12 duration-1000">
        {!userData?.isApproved ? (
          <div className="bg-white rounded-[3.5rem] p-16 text-center border-4 border-dashed border-orange-200 shadow-orange-100">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Waiting Approval</h3>
             <p className="text-slate-400 font-medium px-8 leading-relaxed">เจ้าหน้าที่กำลังตรวจสอบร้านค้าของคุณ โปรดกลับมาใหม่อีกครั้งเมื่อได้รับอนุมัติครับ</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-[3.5rem] p-12 text-center border-none shadow-orange-200/40 relative overflow-hidden">
               <div className="absolute -top-10 -left-10 w-40 h-40 bg-orange-50 rounded-full blur-3xl opacity-50"></div>
               <p className="text-slate-400 font-black text-xs uppercase mb-3 tracking-widest relative z-10">แลกคูปองวันนี้</p>
               <h2 className="text-9xl font-black text-orange-500 mb-8 tracking-tighter relative z-10">{redemptions.length}</h2>
               <div className="bg-orange-600 text-white py-6 rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in duration-700">
                  <p className="text-orange-100 text-[10px] font-black uppercase mb-1 tracking-widest text-center">ยอดเงินสะสมที่ระบบต้องจ่าย</p>
                  <p className="text-5xl font-black text-center">{redemptions.length * 20} ฿</p>
               </div>
            </div>
            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-dashed border-orange-100 text-center shadow-sm">
               <p className="text-slate-400 font-bold text-xs uppercase mb-4 tracking-widest text-center">Store QR / ID</p>
               <div className="bg-slate-50 p-5 rounded-2xl font-mono text-sm break-all font-bold text-orange-900 border border-orange-100 select-all">{user?.uid}</div>
               <p className="text-[10px] text-orange-300 mt-4 italic font-medium px-4">ให้ลูกค้านำรหัสนี้ไปใส่ในหน้าแสกนเพื่อหักส่วนลดครับ</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BuyPassView({ settings, onBack, onConfirm, isActionLoading }: any) {
  const [slip, setSlip] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-lg flex flex-col h-full">
        <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-500 font-black text-xs uppercase tracking-widest active:scale-90 transition-all self-start">
          <ChevronLeft size={20} /> กลับ
        </button>

        <h2 className="text-4xl font-black mb-10 italic tracking-tighter text-slate-900 animate-in fade-in duration-500">ซื้อพาสใหม่</h2>

        <div className="bg-white rounded-[3.5rem] p-10 mb-8 border-indigo-100 border-2 shadow-indigo-50 animate-in slide-in-from-top-4 duration-700 text-center">
          <p className="text-indigo-600 font-black text-[11px] uppercase tracking-[0.3em] mb-6">โอนเงินเข้าบัญชี (79.00 บาท)</p>
          <div className="bg-slate-50 aspect-square rounded-[3rem] mb-8 flex items-center justify-center border-4 border-dashed border-slate-100 overflow-hidden shadow-inner p-4 relative group">
            {settings.promptPayQr ? (
              <img src={settings.promptPayQr} className="w-full h-full object-contain animate-in zoom-in duration-1000" alt="QR" />
            ) : (
              <div className="text-center p-12 opacity-20"><QrCode size={80} className="mx-auto mb-4"/><p className="text-xs font-bold uppercase tracking-widest">Waiting Admin QR</p></div>
            )}
          </div>
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Account: MFU PASS OFFICIAL</p>
        </div>

        <div className="bg-white rounded-[3.5rem] p-10 border border-slate-200 animate-in slide-in-from-bottom-4 duration-700 flex-1 flex flex-col">
          <p className="font-black text-slate-800 mb-6 text-xl tracking-tight text-center">อัปโหลดสลิปยืนยัน</p>
          <label className="flex-1 border-4 border-dashed border-slate-100 rounded-[3rem] min-h-[300px] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative group">
            {slip ? <img src={slip} className="max-h-full rounded-2xl animate-in fade-in" alt="preview" /> : (
              <div className="text-center">
                <Upload size={64} className="text-slate-200 mx-auto mb-4 group-hover:text-indigo-400 transition-colors" />
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">เลือกรูปสลิปจากอัลบั้ม</p>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>

        <button 
          onClick={() => onConfirm(slip || "")} 
          disabled={!slip || isActionLoading}
          className="w-full mt-10 bg-indigo-600 text-white font-black py-7 rounded-[2.5rem] shadow-2xl shadow-indigo-100 disabled:opacity-30 active:scale-95 transition-all text-xl uppercase tracking-widest"
        >
          {isActionLoading ? <RefreshCw className="animate-spin mx-auto"/> : "ส่งสลิปยืนยัน"}
        </button>
      </div>
    </div>
  );
}

function ScanQRView({ onBack, activePass, user, onSuccess }: any) {
  const [shopId, setShopId] = useState("");

  return (
    <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center overflow-hidden">
      <h2 className="text-3xl font-black mb-12 tracking-tighter italic text-indigo-400">REDEEM PASS</h2>
      
      <div className="w-full max-w-sm">
        <div className="aspect-square border-4 border-indigo-500 rounded-[4rem] mb-12 relative flex items-center justify-center overflow-hidden bg-black shadow-[0_0_120px_rgba(99,102,241,0.25)] animate-in zoom-in duration-700">
          <Camera size={100} className="text-slate-900" />
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 animate-[scan_3.5s_ease-in-out_infinite] shadow-[0_0_30px_#6366f1]"></div>
          <style>{`@keyframes scan { 0% { top: 10%; opacity: 0.5; } 50% { top: 90%; opacity: 1; } 100% { top: 10%; opacity: 0.5; } }`}</style>
        </div>

        <div className="w-full bg-slate-900 p-10 rounded-[3.5rem] border border-slate-800 shadow-2xl animate-in slide-in-from-bottom-8">
           <p className="text-xs font-black text-indigo-400 uppercase mb-5 text-center tracking-[0.3em]">Enter Shop ID Below</p>
           <input 
            type="text" placeholder="PASTE SHOP ID" 
            value={shopId} onChange={e => setShopId(e.target.value)}
            className="w-full bg-black/50 p-6 rounded-3xl text-center font-mono text-2xl text-indigo-300 border border-slate-800 outline-none focus:border-indigo-500 transition-all shadow-inner uppercase"
           />
           <button 
            onClick={async () => {
              if (!shopId || !activePass) return;
              const db = getFirestore();
              await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
              await addDoc(collection(db, 'redemptions'), { studentUid: user.uid, merchantId: shopId, amount: 20, redeemedAt: new Date().toISOString() });
              onSuccess();
            }}
            className="w-full mt-8 bg-indigo-600 py-6 rounded-[1.5rem] font-black text-lg active:scale-95 transition-all shadow-xl shadow-indigo-900/40 uppercase tracking-widest"
           >
            Confirm Redeem
           </button>
        </div>
      </div>

      <button onClick={onBack} className="mt-12 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors active:scale-90">ยกเลิก</button>
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
    <div className="min-h-screen bg-[#10b981] text-white flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-1000 shadow-[inset_0_0_120px_rgba(0,0,0,0.1)]">
      <div className="bg-white text-[#10b981] p-10 rounded-full mb-12 shadow-2xl animate-bounce border-8 border-green-400/20">
        <CheckCircle size={120} strokeWidth={3} />
      </div>
      <h1 className="text-7xl font-black mb-8 italic tracking-tighter drop-shadow-2xl uppercase animate-in slide-in-from-top-12">Paid!</h1>
      <div className="bg-black/15 p-10 rounded-[4rem] backdrop-blur-xl mb-16 w-full max-w-sm border border-white/20 shadow-2xl animate-in zoom-in duration-700 delay-300">
        <p className="text-xs font-black tracking-[0.3em] mb-4 opacity-70 uppercase">Coupon Used Successfully</p>
        <p className="text-8xl font-black tracking-tighter">20<span className="text-3xl ml-2 opacity-50">฿</span></p>
      </div>
      <div className="text-7xl font-mono font-black tracking-tighter mb-24 opacity-90 animate-pulse drop-shadow-lg">
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      <button onClick={onDone} className="w-full bg-white text-[#10b981] font-black py-7 rounded-[2.5rem] text-2xl shadow-2xl active:scale-95 hover:bg-green-50 transition-all uppercase tracking-widest animate-in slide-in-from-bottom-12 max-w-sm">
        Done
      </button>
    </div>
  );
}