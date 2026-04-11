"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, Upload, CheckCircle, Camera, LogOut, Clock, ChevronLeft, 
  Mail, Lock, UserPlus, LogIn, Users, Info, Sparkles, Image as ImageIcon, 
  Settings, Save, RefreshCw 
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut 
} from "firebase/auth";

import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, 
  onSnapshot, updateDoc, increment, serverTimestamp 
} from "firebase/firestore";

/* ==================== TYPES ==================== */
interface UserData {
  uid: string;
  email: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
  createdAt?: any;
}

interface PurchaseSlip {
  id: string;
  studentUid: string;
  slipUrl: string;
  status: string;
  createdAt?: string;
}

interface Redemption {
  studentUid: string;
  merchantId: string;
  amount: number;
  redeemedAt: string;
}

interface AppSettings {
  promptPayQr: string | null;
  price: number;
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

/* ==================== MAIN COMPONENT ==================== */
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
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [systemSettings, setSystemSettings] = useState<AppSettings>({ promptPayQr: null, price: 79 });

  // Auth Initialization
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
            setCurrentView(data.role || 'auth');
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

    // System Settings
    unsubs.push(
      onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
      })
    );

    if (['student', 'guest', 'buy_pass', 'scan_qr'].includes(currentView)) {
      unsubs.push(
        onSnapshot(collection(db, 'passes'), (snap) => {
          const myPass = snap.docs.find(d => d.data().studentUid === user.uid && (d.data().remainingCoupons ?? 0) > 0);
          setActivePass(myPass ? { id: myPass.id, ...myPass.data() } : null);
        })
      );

      unsubs.push(
        onSnapshot(collection(db, 'purchases'), (snap) => {
          const myPending = snap.docs.find(d => d.data().studentUid === user.uid && d.data().status === 'pending');
          setPendingPurchase(myPending ? { id: myPending.id, ...myPending.data() } : null);
        })
      );
    }

    if (currentView === 'merchant') {
      unsubs.push(
        onSnapshot(collection(db, 'redemptions'), (snap) => {
          setRedemptions(
            snap.docs
              .filter(d => d.data().merchantId === user.uid)
              .map(d => ({ ...d.data() } as Redemption))
          );
        })
      );
    }

    if (currentView === 'admin') {
      unsubs.push(
        onSnapshot(collection(db, 'purchases'), (snap) => {
          setAllPendingSlips(
            snap.docs
              .filter(d => d.data().status === 'pending')
              .map(d => ({ id: d.id, ...d.data() } as PurchaseSlip))
          );
        })
      );

      unsubs.push(
        onSnapshot(collection(db, 'users'), (snap) => {
          setAllPendingMerchants(
            snap.docs
              .filter(d => d.data().role === 'merchant' && d.data().isApproved === false)
              .map(d => ({ id: d.id, ...d.data() }))
          );
        })
      );
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [user, currentView]);

  // Handlers
  const handleAuthAction = async (email: string, password: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      alert(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = () => signOut(getAuth());

  const handleRoleSelect = async (role: string) => {
    if (!user) return;
    setIsActionLoading(true);
    try {
      const db = getFirestore();
      const data: UserData = {
        uid: user.uid,
        email: user.email!,
        role: role as any,
        isApproved: role !== 'merchant',
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', user.uid), data, { merge: true });
      setCurrentView(role);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Loading Screen
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl animate-bounce">
            <Ticket className="text-white" size={32} />
          </div>
          <p className="text-indigo-950 font-black text-xl tracking-tighter uppercase">MFU Pass</p>
        </div>
      </div>
    );
  }

  // Auth View
  if (currentView === 'auth') {
    return (
      <AuthScreenView
        authMode={authMode}
        setAuthMode={setAuthMode}
        onAuth={handleAuthAction}
        onRoleSelect={handleRoleSelect}
        isActionLoading={isActionLoading}
      />
    );
  }

  // Admin View
  if (currentView === 'admin') {
    return (
      <AdminDashboardView
        allPendingSlips={allPendingSlips}
        allPendingMerchants={allPendingMerchants}
        systemSettings={systemSettings}
        onLogout={handleLogout}
        isActionLoading={isActionLoading}
      />
    );
  }

  // Student / Guest View
  if (currentView === 'student' || currentView === 'guest') {
    return (
      <StudentDashboardView
        user={user}
        activePass={activePass}
        pendingPurchase={pendingPurchase}
        onLogout={handleLogout}
        onBuyPass={() => setCurrentView('buy_pass')}
        onScan={() => setCurrentView('scan_qr')}
      />
    );
  }

  // Merchant View
  if (currentView === 'merchant') {
    return (
      <MerchantDashboardView
        user={user}
        userData={userData}
        redemptions={redemptions}
        onLogout={handleLogout}
      />
    );
  }

  // Buy Pass View
  if (currentView === 'buy_pass') {
    return (
      <BuyPassView
        settings={systemSettings}
        onBack={() => setCurrentView('student')}
        isActionLoading={isActionLoading}
        onConfirm={async (slip: string) => {
          setIsActionLoading(true);
          try {
            const db = getFirestore();
            await addDoc(collection(db, 'purchases'), {
              studentUid: user.uid,
              slipUrl: slip,
              status: 'pending',
              createdAt: new Date().toISOString()
            });
            setCurrentView('student');
          } catch (e: any) {
            alert(e.message);
          } finally {
            setIsActionLoading(false);
          }
        }}
      />
    );
  }

  // Scan QR View
  if (currentView === 'scan_qr') {
    return (
      <ScanQRView
        onBack={() => setCurrentView('student')}
        activePass={activePass}
        user={user}
        onSuccess={() => setCurrentView('success')}
      />
    );
  }

  // Success View
  if (currentView === 'success') {
    return <SuccessView onDone={() => setCurrentView('student')} />;
  }

  return null;
}

/* ==================== SUB COMPONENTS ==================== */

function Header({ title, subtitle, color = "indigo", onLogout }: any) {
  return (
    <div className={`bg-${color}-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden mb-8`}>
      <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={240} /></div>
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-black italic tracking-tighter">{title}</h2>
          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{subtitle}</p>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 transition-all">
            <LogOut size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return (
    <div className={`bg-white rounded-[3rem] shadow-[0_10px_60px_rgba(0,0,0,0.04)] border border-slate-100 p-8 ${className}`}>
      {children}
    </div>
  );
}

function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuth(email, password);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-12">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.2rem] flex items-center justify-center shadow-2xl mb-6 rotate-3">
            <Ticket size={48} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mt-3">Digital Coupons</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4">
            <p className="text-center font-bold text-slate-500 mb-8 uppercase text-[10px] tracking-widest">
              ยินดีต้อนรับ! โปรดระบุตัวตนของคุณ
            </p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-3 shadow-sm border border-slate-200 overflow-hidden">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-bold text-slate-800 bg-transparent text-lg" required />
              </div>
              <div className="h-[1px] bg-slate-100 mx-6" />
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-bold text-slate-800 bg-transparent text-lg" required />
              </div>
            </div>

            <button disabled={isActionLoading}
              className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-xl disabled:opacity-70">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={24} /> : <UserPlus size={24} />)}
              {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-indigo-600">
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
    <button onClick={onClick}
      className="w-full bg-white p-7 rounded-[2.5rem] flex items-center gap-6 border-2 border-transparent hover:border-indigo-600 transition-all shadow-sm active:scale-95">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600 transition-all`}>{icon}</div>
      <div className="text-left font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout, isActionLoading }: any) {
  const [qrText, setQrText] = useState(systemSettings.promptPayQr || "");
  const db = getFirestore();

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans pb-32 overflow-y-auto">
      <div className="flex justify-between items-center mb-12 pt-6">
        <div>
          <h2 className="text-3xl font-black text-indigo-400 italic tracking-tighter">Admin Panel</h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">System Controller</p>
        </div>
        <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20"><LogOut size={20} /></button>
      </div>

      {/* Settings */}
      <section className="mb-12">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Settings size={14} /> Settings
        </h3>
        <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800">
          <p className="text-sm font-bold mb-4 text-indigo-300">PromptPay QR</p>
          <textarea value={qrText} onChange={e => setQrText(e.target.value)}
            className="w-full bg-black/50 border border-slate-700 rounded-2xl p-5 text-xs font-mono h-32 outline-none focus:border-indigo-500"
            placeholder="Paste QR Image URL" />
          <button onClick={async () => {
            await setDoc(doc(db, 'settings', 'global'), { promptPayQr: qrText }, { merge: true });
            alert("บันทึกเรียบร้อย!");
          }}
            className="w-full bg-indigo-600 py-4 rounded-2xl font-black mt-4 active:scale-95">
            <Save className="inline mr-2" size={18} /> SAVE QR
          </button>
        </div>
      </section>

      {/* Pending Slips */}
      <section className="mb-12">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
          Pending Slips ({allPendingSlips.length})
        </h3>
        <div className="space-y-6">
          {allPendingSlips.length === 0 ? (
            <p className="text-slate-400 italic">ไม่มีสลิปที่รอตรวจสอบ</p>
          ) : allPendingSlips.map((s: PurchaseSlip) => (
            <div key={s.id} className="bg-slate-900 p-6 rounded-[3rem] border border-slate-800">
              <p className="text-[10px] font-mono text-slate-500 mb-3">User: {s.studentUid}</p>
              <img src={s.slipUrl} className="w-full rounded-2xl mb-6 aspect-[3/4] object-cover border border-slate-700" alt="slip" />
              <div className="flex gap-4">
                <button onClick={async () => {
                  await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
                  await addDoc(collection(db, 'passes'), { studentUid: s.studentUid, remainingCoupons: 5 });
                }} className="flex-1 bg-green-500 py-5 rounded-2xl font-black active:scale-95">APPROVE</button>
                <button onClick={async () => {
                  await updateDoc(doc(db, 'purchases', s.id), { status: 'rejected' });
                }} className="flex-1 bg-red-600 py-5 rounded-2xl font-black active:scale-95">REJECT</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending Merchants */}
      <section>
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
          Pending Merchants ({allPendingMerchants.length})
        </h3>
        <div className="space-y-4">
          {allPendingMerchants.map((m: any) => (
            <div key={m.id} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex justify-between items-center">
              <div>
                <p className="font-bold text-indigo-300">{m.email}</p>
                <p className="text-xs opacity-50">{m.id}</p>
              </div>
              <button onClick={async () => {
                await updateDoc(doc(db, 'users', m.id), { isApproved: true });
              }} className="bg-green-600 px-6 py-2 rounded-xl text-sm font-bold active:scale-95">Approve</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StudentDashboardView({ user, activePass, pendingPurchase, onLogout, onBuyPass, onScan }: any) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-20">
      <Header title="My Wallet" subtitle={user?.email} onLogout={onLogout} />
      <div className="px-6 -mt-12 flex-1 space-y-8">
        <div className="bg-white rounded-[3rem] shadow-xl p-10">
          {activePass ? (
            <div className="text-center">
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-2">คูปองคงเหลือ</p>
              <div className="text-8xl font-black text-slate-900 mb-2">{activePass.remainingCoupons}</div>
              <p className="text-slate-400">/ 5</p>
              <button onClick={onScan} className="mt-8 w-full bg-indigo-600 text-white font-black py-6 rounded-2xl text-lg active:scale-95">
                <QrCode className="inline mr-3" /> SCAN TO REDEEM
              </button>
            </div>
          ) : pendingPurchase ? (
            <div className="text-center py-12">
              <Loader2 className="w-16 h-16 mx-auto animate-spin text-amber-500 mb-6" />
              <p className="text-xl font-bold">กำลังตรวจสอบสลิป...</p>
            </div>
          ) : (
            <div className="text-center py-10">
              <Ticket size={80} className="mx-auto text-slate-200 mb-6" />
              <h3 className="text-2xl font-bold mb-3">ยังไม่มีพาส</h3>
              <button onClick={onBuyPass} className="mt-6 w-full bg-indigo-600 text-white font-black py-6 rounded-2xl">
                ซื้อพาสใหม่ (79 บาท)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MerchantDashboardView({ user, userData, redemptions, onLogout }: any) {
  return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-20">
      <Header title="Shop Center" subtitle={`ID: ${user?.uid?.slice(0, 8)}`} color="orange" onLogout={onLogout} />
      <div className="px-6 -mt-12 flex-1 space-y-8">
        {!userData?.isApproved ? (
          <div className="bg-white rounded-[3rem] p-16 text-center">
            <Clock size={64} className="mx-auto text-orange-400 mb-6" />
            <h3 className="text-2xl font-bold">รอการอนุมัติ</h3>
          </div>
        ) : (
          <div className="bg-white rounded-[3rem] p-12 text-center">
            <p className="text-8xl font-black text-orange-500 mb-4">{redemptions.length}</p>
            <p className="text-xl font-bold text-orange-600">ครั้งที่ใช้สิทธิ์วันนี้</p>
          </div>
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
    <div className="min-h-screen bg-[#F2F2F7] p-8 font-sans">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-500">
        <ChevronLeft size={20} /> กลับ
      </button>

      <h2 className="text-4xl font-black mb-10">ซื้อพาสใหม่</h2>

      <div className="bg-white rounded-[3rem] p-8 mb-8">
        {settings.promptPayQr ? (
          <img src={settings.promptPayQr} className="w-full rounded-2xl" alt="QR" />
        ) : (
          <p className="text-center text-slate-400 py-12">รอแอดมินตั้งค่า QR</p>
        )}
      </div>

      <div className="bg-white rounded-[3rem] p-8">
        <p className="font-bold mb-6 text-center">อัปโหลดสลิป</p>
        <label className="border-2 border-dashed border-slate-300 rounded-[2.5rem] h-80 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50">
          {slip ? <img src={slip} className="max-h-full rounded-2xl" alt="preview" /> : (
            <div className="text-center">
              <Upload size={60} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-400">กดเพื่อเลือกรูปสลิป</p>
            </div>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </div>

      <button 
        onClick={() => onConfirm(slip || "")} 
        disabled={!slip || isActionLoading}
        className="w-full mt-8 bg-indigo-600 text-white font-black py-7 rounded-[2.5rem] disabled:opacity-50 active:scale-95"
      >
        {isActionLoading ? "กำลังส่ง..." : "ส่งสลิปยืนยัน"}
      </button>
    </div>
  );
}

function ScanQRView({ onBack, activePass, user, onSuccess }: any) {
  const [shopId, setShopId] = useState("");

  return (
    <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center">
      <h2 className="text-3xl font-black mb-12">REDEEM PASS</h2>
      
      <div className="w-full max-w-sm">
        <div className="aspect-square border-4 border-indigo-500 rounded-[3rem] flex items-center justify-center bg-black relative overflow-hidden mb-10">
          <Camera size={100} className="text-slate-600" />
        </div>

        <input 
          type="text" 
          placeholder="PASTE SHOP ID" 
          value={shopId} 
          onChange={e => setShopId(e.target.value)}
          className="w-full bg-slate-900 p-6 rounded-3xl text-center text-2xl font-mono border border-slate-700 outline-none focus:border-indigo-500"
        />

        <button 
          onClick={async () => {
            if (!shopId || !activePass) return;
            const db = getFirestore();
            await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
            await addDoc(collection(db, 'redemptions'), {
              studentUid: user.uid,
              merchantId: shopId,
              amount: 20,
              redeemedAt: new Date().toISOString()
            });
            onSuccess();
          }}
          className="w-full mt-8 bg-indigo-600 py-6 rounded-2xl font-black text-lg active:scale-95"
        >
          CONFIRM REDEMPTION
        </button>
      </div>

      <button onClick={onBack} className="mt-12 text-slate-400">ยกเลิก</button>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  return (
    <div className="min-h-screen bg-green-500 text-white flex flex-col items-center justify-center p-12 text-center">
      <CheckCircle size={120} className="mb-10" />
      <h1 className="text-6xl font-black mb-6">สำเร็จ!</h1>
      <p className="text-2xl mb-12">หักคูปอง 20 บาทเรียบร้อย</p>
      <button onClick={onDone} className="bg-white text-green-600 px-12 py-6 rounded-2xl font-black text-xl active:scale-95">
        กลับหน้าหลัก
      </button>
    </div>
  );
}