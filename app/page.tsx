"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, Plus, Minus 
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

    // Settings
    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
    }));

    // Student & Guest
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

    // Merchant
    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setRedemptions(snap.docs.filter(d => d.data().merchantId === user.uid).map(d => d.data()));
      }));
    }

    // Admin
    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllPendingMerchants(
          snap.docs.filter(d => d.data().role === 'merchant' && d.data().isApproved === false)
            .map(d => ({ id: d.id, ...d.data() }))
        );
      }));
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [user, currentView]);

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

  // Loading
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Route Views
  if (currentView === 'auth') {
    return <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} />;
  }

  if (currentView === 'admin') {
    return <AdminDashboardView allPendingSlips={allPendingSlips} allPendingMerchants={allPendingMerchants} systemSettings={systemSettings} onLogout={handleLogout} />;
  }

  if (currentView === 'student' || currentView === 'guest') {
    return <StudentDashboardView user={user} activePass={activePass} pendingPurchase={pendingPurchase} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} />;
  }

  if (currentView === 'merchant') {
    return <MerchantDashboardView user={user} redemptions={redemptions} onLogout={handleLogout} />;
  }

  if (currentView === 'buy_pass') {
    return <BuyPassView settings={systemSettings} onBack={() => setCurrentView('student')} user={user} />;
  }

  if (currentView === 'scan_qr') {
    return <ScanQRView onBack={() => setCurrentView('student')} activePass={activePass} user={user} onSuccess={() => setCurrentView('success')} />;
  }

  if (currentView === 'success') {
    return <SuccessView onDone={() => setCurrentView('student')} />;
  }

  return null;
}

/* ==================== SUB COMPONENTS ==================== */

function Header({ title, subtitle, color = "indigo", onLogout }: any) {
  return (
    <div className={`bg-${color}-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden`}>
      <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={240} /></div>
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-black italic tracking-tighter">{title}</h2>
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">{subtitle}</p>
        </div>
        {onLogout && <button onClick={onLogout} className="bg-white/20 p-3 rounded-2xl hover:bg-white/30"><LogOut size={22} /></button>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-[2.75rem] shadow-xl p-8 ${className}`}>{children}</div>;
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
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-6 rotate-3">
            <Ticket size={52} className="text-white" strokeWidth={2.8} />
          </div>
          <h1 className="text-5xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.5em] mt-3">Digital Meal Coupons</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4">
            <p className="text-center font-bold text-slate-500 mb-8 uppercase text-xs tracking-widest">โปรดเลือกบทบาทของคุณ</p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-3 shadow border border-slate-100">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-medium text-lg" required />
              </div>
              <div className="h-px bg-slate-100 mx-6" />
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="password" placeholder="รหัสผ่าน" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full p-5 pl-14 outline-none font-medium text-lg" required />
              </div>
            </div>

            <button disabled={isActionLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-2xl text-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={24} /> : <UserPlus size={24} />)}
              {authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>

            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-500 text-sm font-medium">
              {authMode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white p-7 rounded-[2.5rem] flex items-center gap-6 border-2 border-transparent hover:border-indigo-500 active:scale-95 transition-all shadow">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600`}>{icon}</div>
      <div className="font-black text-2xl text-slate-800">{title}</div>
    </button>
  );
}

function AdminDashboardView({ allPendingSlips, allPendingMerchants, systemSettings, onLogout }: any) {
  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: PurchaseSlip) => s.status === 'pending');
  const approvedSlips = allPendingSlips.filter((s: PurchaseSlip) => s.status === 'approved');

  const totalPending = pendingSlips.reduce((sum: number, s: PurchaseSlip) => sum + (s.totalAmount || 0), 0);
  const totalApproved = approvedSlips.reduce((sum: number, s: PurchaseSlip) => sum + (s.totalAmount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 pb-32 font-sans">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-black italic text-indigo-400">Admin Panel</h1>
        <button onClick={onLogout} className="p-3 bg-white/10 rounded-2xl"><LogOut size={24} /></button>
      </div>

      {/* ตั้งราคา */}
      <div className="bg-slate-900 rounded-3xl p-8 mb-10">
        <p className="text-indigo-300 font-bold mb-4">ราคา 1 เซ็ต (5 คูปอง)</p>
        <div className="flex gap-4">
          <input 
            type="number" 
            value={pricePerSet} 
            onChange={(e) => setPricePerSet(Number(e.target.value))} 
            className="flex-1 bg-black/60 text-5xl font-black text-center rounded-2xl p-6 outline-none" 
          />
          <button 
            onClick={async () => {
              await setDoc(doc(db, 'settings', 'global'), { pricePerSet, promptPayQr: systemSettings.promptPayQr }, { merge: true });
              alert("บันทึกราคาเรียบร้อยแล้ว");
            }}
            className="bg-green-600 px-10 rounded-2xl font-black text-lg"
          >
            บันทึก
          </button>
        </div>
      </div>

      {/* สรุปยอดเงิน */}
      <div className="grid grid-cols-2 gap-6 mb-12">
        <div className="bg-slate-900 rounded-3xl p-8">
          <p className="text-slate-400 text-sm">ยอดรอตรวจสอบ</p>
          <p className="text-5xl font-black text-amber-400 mt-2">{totalPending.toLocaleString()} บาท</p>
        </div>
        <div className="bg-slate-900 rounded-3xl p-8">
          <p className="text-slate-400 text-sm">ยอดที่อนุมัติแล้ว</p>
          <p className="text-5xl font-black text-green-400 mt-2">{totalApproved.toLocaleString()} บาท</p>
        </div>
      </div>

      {/* รายการสลิป */}
      <h3 className="uppercase text-xs font-black tracking-widest text-slate-400 mb-6">สลิปที่รอตรวจสอบ ({pendingSlips.length})</h3>
      {pendingSlips.length === 0 ? (
        <p className="text-slate-500 italic">ยังไม่มีสลิปที่รอตรวจสอบ</p>
      ) : (
        pendingSlips.map((slip: PurchaseSlip) => (
          <div key={slip.id} className="bg-slate-900 rounded-3xl p-6 mb-8">
            <div className="flex justify-between mb-4 text-sm">
              <span>เซ็ต {slip.numSets} ชุด • {slip.totalAmount} บาท</span>
              <span className="text-amber-400">รอตรวจสอบ</span>
            </div>
            <img src={slip.slipUrl} className="w-full rounded-2xl mb-6" alt="slip" />
            <div className="flex gap-4">
              <button 
                onClick={async () => {
                  await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
                  await addDoc(collection(db, 'passes'), {
                    studentUid: slip.studentUid,
                    remainingCoupons: 5 * slip.numSets,
                    createdAt: serverTimestamp()
                  });
                  alert("อนุมัติเรียบร้อยแล้ว");
                }}
                className="flex-1 bg-green-600 py-5 rounded-2xl font-black active:scale-95"
              >
                ✅ อนุมัติ
              </button>
              <button 
                onClick={async () => await updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' })}
                className="flex-1 bg-red-600 py-5 rounded-2xl font-black active:scale-95"
              >
                ❌ ปฏิเสธ
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StudentDashboardView({ user, activePass, pendingPurchase, onLogout, onBuyPass, onScan }: any) {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-20">
      <Header title="My Wallet" subtitle={user?.email} onLogout={onLogout} />
      <div className="px-6 -mt-12 flex-1 space-y-8">
        <Card>
          {pendingPurchase ? (
            <div className="text-center py-16">
              <Clock className="mx-auto text-amber-500 mb-8" size={80} />
              <h3 className="text-2xl font-black">รอการตรวจสอบ</h3>
              <p className="mt-3 text-slate-600">เซ็ต {pendingPurchase.numSets} ชุด • {pendingPurchase.totalAmount} บาท</p>
            </div>
          ) : activePass ? (
            <div className="text-center">
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">คูปองคงเหลือ</p>
              <div className="text-[6.5rem] font-black text-slate-900 leading-none mt-2">{activePass.remainingCoupons}</div>
              <p className="text-slate-400">/ 5 ต่อเซ็ต</p>
              <button onClick={onScan} className="mt-12 w-full bg-indigo-600 text-white font-black py-6 rounded-2xl text-xl active:scale-95">
                <QrCode className="inline mr-3" size={28} /> แสกนเพื่อใช้คูปอง
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <Ticket size={90} className="mx-auto text-slate-200 mb-6" />
              <h3 className="text-3xl font-black">ยังไม่มีพาส</h3>
              <button onClick={onBuyPass} className="mt-10 w-full bg-indigo-600 text-white font-black py-7 rounded-2xl text-xl">ซื้อพาสใหม่</button>
            </div>
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
    if (!slip) return alert("กรุณาอัปโหลดสลิป");
    if (!user) return alert("กรุณาเข้าสู่ระบบ");

    const db = getFirestore();
    await addDoc(collection(db, 'purchases'), {
      studentUid: user.uid,
      numSets,
      totalAmount,
      slipUrl: slip,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    alert(`ส่งสลิปยอด ${totalAmount} บาท เรียบร้อยแล้ว\n\nกรุณารอแอดมินตรวจสอบ`);
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-8 font-sans max-w-md mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 mb-8"><ChevronLeft size={24} /> กลับ</button>

      <h2 className="text-4xl font-black mb-10">ซื้อพาส</h2>

      <Card className="mb-8">
        <p className="text-center text-indigo-600 font-bold">ราคา 1 เซ็ต (5 คูปอง) = {settings.pricePerSet} บาท</p>
        
        <div className="flex items-center justify-center gap-8 my-10">
          <button onClick={() => setNumSets(n => Math.max(1, n - 1))} className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl font-black active:scale-95">-</button>
          <div className="text-7xl font-black w-20 text-center">{numSets}</div>
          <button onClick={() => setNumSets(n => n + 1)} className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl font-black active:scale-95">+</button>
        </div>

        <p className="text-center text-4xl font-black text-slate-900">ยอดที่ต้องชำระ: {totalAmount} บาท</p>
      </Card>

      {settings.promptPayQr && (
        <Card className="mb-8 p-6">
          <img src={settings.promptPayQr} className="w-full rounded-2xl" alt="PromptPay QR" />
        </Card>
      )}

      <Card>
        <p className="font-bold text-center mb-6">อัปโหลดสลิป {totalAmount} บาท</p>
        <label className="border-2 border-dashed border-slate-300 rounded-3xl h-80 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all">
          {slip ? (
            <img src={slip} className="max-h-[280px] rounded-2xl" alt="preview" />
          ) : (
            <div className="text-center"><Upload size={70} className="text-slate-300 mx-auto mb-4" /><p className="text-slate-400">แตะเพื่อเลือกรูปสลิป</p></div>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </Card>

      <button 
        onClick={handleConfirm} 
        disabled={!slip} 
        className="w-full mt-10 bg-indigo-600 text-white font-black py-7 rounded-3xl text-xl active:scale-95 disabled:opacity-50"
      >
        ส่งสลิปเพื่อตรวจสอบ
      </button>
    </div>
  );
}

function MerchantDashboardView({ user, redemptions, onLogout }: any) {
  return (
    <div className="min-h-screen bg-orange-50 font-sans pb-20">
      <Header title="Shop Center" subtitle={`ID: ${user?.uid?.slice(0,8)}`} color="orange" onLogout={onLogout} />
      <div className="px-6 -mt-12">
        <Card>
          <p className="text-center text-8xl font-black text-orange-500">{redemptions.length}</p>
          <p className="text-center text-orange-600 font-bold mt-2">ครั้งที่ใช้สิทธิ์วันนี้</p>
        </Card>
      </div>
    </div>
  );
}

function ScanQRView({ onBack, activePass, user, onSuccess }: any) {
  const [shopId, setShopId] = useState("");

  const handleRedeem = async () => {
    if (!shopId || !activePass || activePass.remainingCoupons <= 0) return alert("ไม่สามารถใช้คูปองได้");
    const db = getFirestore();
    await updateDoc(doc(db, 'passes', activePass.id), { remainingCoupons: increment(-1) });
    await addDoc(collection(db, 'redemptions'), {
      studentUid: user.uid,
      merchantId: shopId,
      amount: 20,
      redeemedAt: new Date().toISOString()
    });
    onSuccess();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center">
      <h2 className="text-3xl font-black mb-12">REDEEM COUPON</h2>
      <div className="w-full max-w-sm aspect-square border-4 border-indigo-500 rounded-[3rem] flex items-center justify-center bg-black mb-12 relative overflow-hidden">
        <Camera size={100} className="text-slate-700" />
      </div>
      <input 
        type="text" 
        placeholder="กรอก Shop ID" 
        value={shopId} 
        onChange={e => setShopId(e.target.value)}
        className="w-full bg-slate-900 p-6 rounded-3xl text-center text-2xl font-mono border border-slate-700 outline-none focus:border-indigo-500"
      />
      <button onClick={handleRedeem} className="w-full mt-8 bg-indigo-600 py-6 rounded-2xl font-black text-lg active:scale-95">ยืนยันการใช้คูปอง</button>
      <button onClick={onBack} className="mt-12 text-slate-400">ยกเลิก</button>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  return (
    <div className="min-h-screen bg-green-500 text-white flex flex-col items-center justify-center p-12 text-center">
      <CheckCircle size={140} className="mb-10 drop-shadow-2xl" />
      <h1 className="text-6xl font-black mb-4">สำเร็จ!</h1>
      <p className="text-2xl mb-16">หักคูปอง 20 บาทเรียบร้อย</p>
      <button onClick={onDone} className="bg-white text-green-600 px-16 py-7 rounded-3xl font-black text-2xl active:scale-95">กลับหน้าหลัก</button>
    </div>
  );
}