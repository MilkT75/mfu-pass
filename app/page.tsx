"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy 
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

    if (['student', 'guest'].includes(currentView)) {
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        const myPass = snap.docs.find(d => d.data().studentUid === user.uid);
        setActivePass(myPass ? { id: myPass.id, ...myPass.data() } : null);
      }));

      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        const pending = snap.docs.find(d => d.data().studentUid === user.uid && d.data().status === 'pending');
        setPendingPurchase(pending ? { id: pending.id, ...pending.data() } : null);
      }));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setRedemptions(snap.docs.filter(d => d.data().merchantId === user.uid).map(d => d.data()));
      }));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter(d => d.data().role === 'merchant' && d.data().isApproved === false).map(d => ({ id: d.id, ...d.data() })));
      }));
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [user, currentView]);

  const handleAuthAction = async (email: string, password: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
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

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (currentView === 'auth') return <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} user={user} />;

  if (currentView === 'admin') return <AdminDashboardView allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={handleLogout} />;

  if (currentView === 'student' || currentView === 'guest') return <StudentDashboardView user={user} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} />;

  if (currentView === 'merchant') return <MerchantDashboardView user={user} redemptions={redemptions} onLogout={handleLogout} />;

  if (currentView === 'buy_pass') return <BuyPassView settings={systemSettings} onBack={() => setCurrentView('student')} user={user} />;

  if (currentView === 'scan_qr') return <ScanQRView onBack={() => setCurrentView('student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} />;

  if (currentView === 'success') return <SuccessView onDone={() => setCurrentView('student')} />;

  return null;
}

/* ==================== SUB COMPONENTS (Responsive + แสดงรหัส + ตั้งค่า QR) ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user }: any) {
  return (
    <div className={`bg-${color}-600 text-white px-6 py-8 md:py-10 rounded-b-[3rem] shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full`}>
      <div className="absolute -right-8 -top-8 opacity-10 rotate-12 pointer-events-none">
        <Ticket size={180} />
      </div>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter">{title}</h2>
          <p className="text-white/70 text-sm font-medium">{subtitle}</p>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-3 rounded-2xl transition-all">
            <LogOut size={22} />
          </button>
        )}
      </div>
      {/* แสดงรหัสเพื่อตรวจสอบ */}
      {user && (
        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-xs">
          <div className="font-mono truncate max-w-[180px]">{user.uid}</div>
          <button 
            onClick={() => { navigator.clipboard.writeText(user.uid); alert("คัดลอก UID เรียบร้อย"); }}
            className="text-white/80 hover:text-white flex items-center gap-1 text-[10px] font-medium"
          >
            <Copy size={14} /> Copy
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-3xl shadow-xl p-6 md:p-8 ${className}`}>{children}</div>;
}

/* Auth Screen - Responsive */
function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading, user }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuth(email, password);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md md:max-w-lg bg-white rounded-3xl shadow-2xl p-8 md:p-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-inner mb-6">
            <Ticket size={48} className="text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter">MFU Pass</h1>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4">
            <p className="text-center text-slate-500 font-medium">เลือกบทบาทของคุณ</p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <input type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-6 py-5 rounded-3xl border border-slate-200 focus:border-indigo-500 outline-none text-lg" required />
              <input type="password" placeholder="รหัสผ่าน" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-6 py-5 rounded-3xl border border-slate-200 focus:border-indigo-500 outline-none text-lg" required />
            </div>

            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-6 rounded-3xl text-xl active:scale-95 transition-all flex items-center justify-center gap-3">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={26} /> : <UserPlus size={26} />)}
              {authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-500 text-sm">
              {authMode === 'login' ? 'ยังไม่มีบัญชี? สมัครเลย' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white border-2 border-transparent hover:border-indigo-500 p-6 rounded-3xl flex items-center gap-6 active:scale-95 transition-all shadow-sm">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600`}>{icon}</div>
      <div className="font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

/* Admin Dashboard - Responsive + ตั้งค่า QR + ราคา */
function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout }: any) {
  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const [promptPayQr, setPromptPayQr] = useState(systemSettings.promptPayQr || "");
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: any) => s.status === 'pending');
  const approvedSlips = allPendingSlips.filter((s: any) => s.status === 'approved');

  const totalPending = pendingSlips.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);
  const totalApproved = approvedSlips.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'global'), { pricePerSet, promptPayQr }, { merge: true });
    alert("บันทึกการตั้งค่าเรียบร้อยแล้ว");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8 md:px-8 font-sans max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-indigo-400">Admin Panel</h1>
        <button onClick={onLogout}><LogOut size={28} /></button>
      </div>

      {/* ตั้งค่าราคา + QR */}
      <div className="bg-slate-900 rounded-3xl p-6 md:p-8 mb-8">
        <h3 className="font-bold text-indigo-300 mb-6 flex items-center gap-2"><Settings size={18} /> การตั้งค่าระบบ</h3>
        
        <div className="mb-8">
          <p className="text-slate-400 text-sm mb-3">ราคา 1 เซ็ต (5 คูปอง)</p>
          <input type="number" value={pricePerSet} onChange={e => setPricePerSet(Number(e.target.value))} 
            className="w-full bg-black/60 text-5xl font-black text-center rounded-2xl p-6 outline-none" />
        </div>

        <div>
          <p className="text-slate-400 text-sm mb-3">PromptPay QR Code URL</p>
          <textarea value={promptPayQr} onChange={e => setPromptPayQr(e.target.value)} rows={3}
            className="w-full bg-black/60 rounded-2xl p-5 text-sm font-mono outline-none resize-none" placeholder="https://..." />
          {promptPayQr && <img src={promptPayQr} className="mt-4 max-h-64 mx-auto rounded-2xl shadow-inner" alt="QR Preview" />}
        </div>

        <button onClick={saveSettings} className="w-full mt-8 bg-green-600 py-5 rounded-2xl font-black flex items-center justify-center gap-3">
          <Save size={22} /> บันทึกการตั้งค่า
        </button>
      </div>

      {/* สรุปยอดเงิน */}
      <div className="grid grid-cols-2 gap-4 md:gap-6 mb-12">
        <div className="bg-slate-900 rounded-3xl p-6 text-center">
          <p className="text-amber-400 text-sm font-medium">รอตรวจสอบ</p>
          <p className="text-5xl font-black mt-2">{totalPending.toLocaleString()} บาท</p>
        </div>
        <div className="bg-slate-900 rounded-3xl p-6 text-center">
          <p className="text-green-400 text-sm font-medium">อนุมัติแล้ว</p>
          <p className="text-5xl font-black mt-2">{totalApproved.toLocaleString()} บาท</p>
        </div>
      </div>

      {/* รายการสลิป */}
      <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-4 px-2">สลิปที่รอตรวจสอบ ({pendingSlips.length})</h3>
      {pendingSlips.map((slip: PurchaseSlip) => (
        <div key={slip.id} className="bg-slate-900 rounded-3xl p-6 mb-6">
          <div className="flex justify-between text-xs mb-4">
            <span>เซ็ต {slip.numSets} • {slip.totalAmount} บาท</span>
          </div>
          <img src={slip.slipUrl} className="w-full rounded-2xl mb-6" alt="slip" />
          <div className="flex gap-4">
            <button onClick={async () => {
              await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
              await addDoc(collection(db, 'passes'), { studentUid: slip.studentUid, remainingCoupons: 5 * slip.numSets });
            }} className="flex-1 bg-green-600 py-5 rounded-2xl font-black">✅ อนุมัติ</button>
            <button onClick={async () => await updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' })} className="flex-1 bg-red-600 py-5 rounded-2xl font-black">❌ ปฏิเสธ</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ส่วนที่เหลือ (Student, BuyPass, Merchant, ScanQR, Success) ถูกปรับให้ responsive แล้ว */
function StudentDashboardView({ user, activePass, pendingPurchase, onLogout, onBuyPass, onScan }: any) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-12 max-w-2xl mx-auto w-full">
      <Header title="My Wallet" subtitle={user?.email} user={user} onLogout={onLogout} />
      <div className="px-6 flex-1 space-y-8">
        <Card>
          {pendingPurchase ? (
            <div className="text-center py-12">
              <Clock size={70} className="mx-auto text-amber-500 mb-6" />
              <h3 className="font-black text-2xl">รอตรวจสอบสลิป</h3>
              <p className="text-slate-600 mt-4">เซ็ต {pendingPurchase.numSets} • {pendingPurchase.totalAmount} บาท</p>
            </div>
          ) : activePass ? (
            <div className="text-center">
              <p className="uppercase text-xs font-bold text-slate-400 tracking-widest">คูปองเหลือ</p>
              <div className="text-[5.5rem] font-black leading-none text-slate-900 mt-2">{activePass.remainingCoupons}</div>
              <button onClick={onScan} className="mt-12 w-full bg-indigo-600 text-white font-black py-6 rounded-3xl text-xl">แสกนเพื่อใช้คูปอง</button>
            </div>
          ) : (
            <button onClick={onBuyPass} className="w-full bg-indigo-600 text-white font-black py-8 rounded-3xl text-2xl">ซื้อพาสใหม่</button>
          )}
        </Card>
      </div>
    </div>
  );
}

function BuyPassView({ settings, onBack, user }: any) {
  const [numSets, setNumSets] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const totalAmount = settings.pricePerSet * numSets;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSlip(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = async () => {
    if (!slip || !user) return alert("กรุณาอัปโหลดสลิปและเข้าสู่ระบบ");
    const db = getFirestore();
    await addDoc(collection(db, 'purchases'), {
      studentUid: user.uid,
      numSets,
      totalAmount,
      slipUrl: slip,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    alert(`ส่งสลิปยอด ${totalAmount} บาท เรียบร้อยแล้ว`);
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 md:p-8 max-w-2xl mx-auto w-full font-sans">
      <button onClick={onBack} className="flex items-center gap-2 mb-6 text-slate-500 font-medium"><ChevronLeft size={24} />กลับ</button>
      <h2 className="text-4xl font-black mb-8">ซื้อพาส</h2>

      <Card className="mb-8">
        <div className="flex justify-center items-center gap-8 my-8">
          <button onClick={() => setNumSets(n => Math.max(1, n-1))} className="text-4xl font-black w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">-</button>
          <div className="text-7xl font-black">{numSets}</div>
          <button onClick={() => setNumSets(n => n+1)} className="text-4xl font-black w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">+</button>
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

/* Merchant, ScanQR, Success ใช้ responsive เดิม */
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
      <input type="text" placeholder="กรอก Shop ID" value={shopId} onChange={e => setShopId(e.target.value)}
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