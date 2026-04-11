"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn,
  Users, Smartphone, Info, CreditCard, Sparkles
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  Unsubscribe, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
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
 * เวอร์ชัน: 3.0 (Ultimate MVP - iOS Experience & Role Security)
 */

// --- Admin Credentials (Hardcoded) ---
const ADMIN_EMAIL = "admin@mfupass.com";
const ADMIN_PASS = "mfupass1234";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function App() {
  // Authentication & View States
  const [userUid, setUserUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_setup'>('login');
  const [currentView, setCurrentView] = useState<'auth' | 'student' | 'merchant' | 'admin' | 'guest' | 'buy_pass' | 'scan_qr' | 'success'>('auth');
  
  // User Data States
  const [userData, setUserData] = useState<any>(null);
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [allPendingMerchants, setAllPendingMerchants] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  // 1. Initial Auth & App Setup
  useEffect(() => {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    authUnsubscribe.current = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUserUid(currentUser.uid);
        setUserEmail(currentUser.email);
        
        // พิเศษ: ตรวจสอบถ้าเป็น Admin Hardcoded
        if (currentUser.email === ADMIN_EMAIL) {
          setCurrentView('admin');
          setIsAppReady(true);
          return;
        }

        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (userSnap.exists() && userSnap.data().role) {
          setUserData(userSnap.data());
          setCurrentView(userSnap.data().role);
        } else {
          setAuthMode('role_setup');
          setCurrentView('auth');
        }
      } else {
        setUserUid(null);
        setCurrentView('auth');
        setAuthMode('login');
      }
      setIsAppReady(true);
    });

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { authUnsubscribe.current?.(); clearInterval(timer); };
  }, []);

  // 2. Real-time Listeners (Data Separation)
  useEffect(() => {
    if (!userUid || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    // สำหรับ Student & Guest
    if (['student', 'guest', 'buy_pass', 'scan_qr'].includes(currentView)) {
      unsubs.push(onSnapshot(doc(db, 'passes', userUid), (snap) => setActivePass(snap.exists() ? snap.data() : null)));
      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      unsubs.push(onSnapshot(q, (snap) => setPendingPurchase(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)));
    }

    // สำหรับ Merchant
    if (currentView === 'merchant') {
      const q = query(collection(db, 'redemptions'), where('merchantId', '==', userUid));
      unsubs.push(onSnapshot(q, (snap) => setRedemptions(snap.docs.map(d => d.data()))));
    }

    // สำหรับ Admin
    if (currentView === 'admin') {
      // ติดตามสลิป
      unsubs.push(onSnapshot(query(collection(db, 'purchases'), where('status', '==', 'pending')), (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));
      // ติดตามร้านค้ารออนุมัติ
      unsubs.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'merchant'), where('isApproved', '==', false)), (snap) => {
        setAllPendingMerchants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));
    }

    return () => unsubs.forEach(f => f());
  }, [userUid, currentView]);

  // --- Handlers ---

  const handleLogout = async () => {
    setIsActionLoading(true);
    await signOut(getAuth());
    setUserData(null);
    setIsActionLoading(false);
  };

  const handleRoleSelection = async (role: string) => {
    if (!userUid) return;
    setIsActionLoading(true);
    const data = { 
      uid: userUid, 
      email: userEmail, 
      role, 
      isApproved: role === 'merchant' ? false : true, 
      createdAt: serverTimestamp() 
    };
    await setDoc(doc(getFirestore(), 'users', userUid), data, { merge: true });
    setUserData(data);
    setCurrentView(role as any);
    setIsActionLoading(false);
  };

  // --- UI Components ---

  const Card = ({ children, className = "" }: any) => (
    <div className={`bg-white rounded-[2rem] shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100 p-6 ${className}`}>
      {children}
    </div>
  );

  const Button = ({ onClick, children, variant = "primary", disabled = false, className = "" }: any) => {
    const base = "w-full py-4 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg disabled:opacity-30 disabled:active:scale-100";
    const styles: any = {
      primary: "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700",
      secondary: "bg-white text-slate-700 border border-slate-100 hover:bg-slate-50 shadow-none",
      danger: "bg-red-50 text-red-500 shadow-none hover:bg-red-100",
      success: "bg-green-500 text-white shadow-green-200"
    };
    return <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
  };

  // --- Auth & Login ---
  const AuthScreen = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [localError, setLocalError] = useState("");

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsActionLoading(true);
      setLocalError("");
      try {
        if (authMode === 'register') {
          await createUserWithEmailAndPassword(getAuth(), formData.email, formData.password);
        } else {
          await signInWithEmailAndPassword(getAuth(), formData.email, formData.password);
        }
      } catch (e: any) { setLocalError(e.message); setIsActionLoading(false); }
    };

    return (
      <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-[400px] animate-in fade-in zoom-in duration-700">
          <div className="flex flex-col items-center mb-10">
             <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-indigo-200 mb-4 rotate-3">
               <Ticket size={40} className="text-white" strokeWidth={2.5}/>
             </div>
             <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
             <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">Digital Coupon System</p>
          </div>

          {authMode === 'role_setup' ? (
            <div className="space-y-4">
               <p className="text-center font-bold text-slate-500 mb-6 uppercase text-xs tracking-widest">ยินดีต้อนรับ! โปรดระบุตัวตนของคุณ</p>
               <button onClick={() => handleRoleSelection('student')} className="w-full bg-white p-6 rounded-3xl flex items-center gap-6 border-2 border-transparent hover:border-indigo-600 transition-all shadow-sm group">
                  <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={24}/></div>
                  <div className="text-left font-black text-xl text-slate-800">นักศึกษา</div>
               </button>
               <button onClick={() => handleRoleSelection('guest')} className="w-full bg-white p-6 rounded-3xl flex items-center gap-6 border-2 border-transparent hover:border-blue-600 transition-all shadow-sm group">
                  <div className="bg-blue-50 p-4 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all"><Users size={24}/></div>
                  <div className="text-left font-black text-xl text-slate-800">บุคคลทั่วไป</div>
               </button>
               <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white p-6 rounded-3xl flex items-center gap-6 border-2 border-transparent hover:border-orange-500 transition-all shadow-sm group">
                  <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all"><Store size={24}/></div>
                  <div className="text-left font-black text-xl text-slate-800">ร้านค้า</div>
               </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {localError && <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-xs font-bold border border-red-100">{localError}</div>}
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-200">
                <input 
                  type="email" placeholder="Email" value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full p-4 outline-none font-bold text-slate-700 rounded-2xl bg-transparent" required 
                />
                <div className="h-[1px] bg-slate-100 mx-4"></div>
                <input 
                  type="password" placeholder="Password" value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full p-4 outline-none font-bold text-slate-700 rounded-2xl bg-transparent" required 
                />
              </div>
              <Button disabled={isActionLoading}>{authMode === 'login' ? 'LOG IN' : 'SIGN UP'}</Button>
              <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest mt-4">
                {authMode === 'login' ? 'สมัครสมาชิกใหม่' : 'กลับไปหน้าล็อกอิน'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  };

  // --- Student Dashboard ---
  const StudentDashboard = () => (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col pb-10 font-sans">
      <div className="bg-indigo-600 text-white p-10 pt-16 rounded-b-[4rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12"><Ticket size={240}/></div>
        <div className="relative z-10">
          <p className="text-indigo-200 font-bold text-[10px] uppercase tracking-[0.2em] mb-1">ยินดีต้อนรับ</p>
          <h2 className="text-4xl font-black italic tracking-tighter">My Wallet</h2>
          <p className="text-indigo-100/60 text-[9px] font-mono mt-4 truncate">{userEmail}</p>
        </div>
      </div>

      <div className="px-6 -mt-10 flex-1 space-y-6 relative z-10 animate-in slide-in-from-bottom-8 duration-500">
        <Card className="flex flex-col items-center">
           {activePass ? (
             <>
               <div className="flex justify-between w-full mb-6">
                 <div className="bg-indigo-50 p-4 rounded-3xl text-indigo-600"><Wallet size={24}/></div>
                 <span className="bg-green-100 text-green-600 px-4 py-1 rounded-full text-[10px] font-black h-fit uppercase tracking-widest">Active</span>
               </div>
               <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1">คูปองคงเหลือ</p>
               <div className="flex items-baseline gap-2 mb-2">
                 <span className="text-8xl font-black text-slate-900">{activePass.remainingCoupons}</span>
                 <span className="text-2xl text-slate-200 font-bold">/ 5</span>
               </div>
               <p className="text-green-500 font-black text-sm mb-8 flex items-center gap-2">
                 <Sparkles size={16}/> มูลค่า {activePass.remainingCoupons * 20} บาท
               </p>
               <Button onClick={() => setCurrentView('scan_qr')}>
                  <QrCode size={20}/> แสกนใช้ส่วนลด (20 บาท)
               </Button>
             </>
           ) : pendingPurchase ? (
             <div className="py-10 text-center">
                <Loader2 className="w-16 h-16 text-amber-500 animate-spin mx-auto mb-6" />
                <h3 className="text-2xl font-black text-slate-800 mb-2">รออนุมัติสลิป</h3>
                <p className="text-slate-400 text-sm font-medium">แอดมินกำลังตรวจสอบความถูกต้อง</p>
             </div>
           ) : (
             <div className="py-8 text-center w-full">
                <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6"><Ticket size={48}/></div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">คุณยังไม่มีคูปอง</h3>
                <p className="text-slate-400 text-sm mb-8 px-6">ซื้อ Welcome Back Pass เพื่อรับคูปอง 5 ใบ ในราคาพิเศษ 79 บาท</p>
                <Button onClick={() => setCurrentView('buy_pass')}>ซื้อคูปองเลย (79.-)</Button>
             </div>
           )}
        </Card>

        <div className="grid grid-cols-2 gap-4">
           <Card className="flex flex-col items-center gap-2 opacity-30 grayscale"><History size={24}/><p className="text-[10px] font-black tracking-widest">HISTORY</p></Card>
           <button onClick={handleLogout} className="w-full">
              <Card className="flex flex-col items-center gap-2 text-red-500 border-red-50"><LogOut size={24}/><p className="text-[10px] font-black tracking-widest">LOGOUT</p></Card>
           </button>
        </div>
      </div>
    </div>
  );

  // --- Admin Mode (Full Control) ---
  const AdminDashboard = () => (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans overflow-y-auto">
      <div className="flex justify-between items-center mb-10">
         <div>
            <h2 className="text-3xl font-black italic text-indigo-400 tracking-tighter">Admin Central</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">System Controller 100%</p>
         </div>
         <button onClick={handleLogout} className="bg-white/10 p-3 rounded-2xl"><LogOut size={20}/></button>
      </div>

      <div className="space-y-8">
        {/* Section: Merchats */}
        <div>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-4">ร้านค้ารออนุมัติ ({allPendingMerchants.length})</h3>
          {allPendingMerchants.length === 0 ? <p className="text-slate-700 text-xs italic">ไม่มีคำขอใหม่</p> : allPendingMerchants.map(m => (
            <div key={m.id} className="bg-slate-800 p-6 rounded-3xl mb-4 border border-slate-700 flex justify-between items-center">
               <div>
                  <p className="font-bold text-lg">{m.email}</p>
                  <p className="text-[10px] font-mono text-slate-500">{m.id}</p>
               </div>
               <button onClick={async () => {
                 await updateDoc(doc(getFirestore(), 'users', m.id), { isApproved: true });
               }} className="bg-indigo-600 px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest">Approve</button>
            </div>
          ))}
        </div>

        {/* Section: Slips */}
        <div>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-4">สลิปเงินรอตรวจสอบ ({allPendingSlips.length})</h3>
          {allPendingSlips.length === 0 ? <p className="text-slate-700 text-xs italic">ไม่มีรายการที่รอดำเนินการ</p> : allPendingSlips.map(s => (
            <div key={s.id} className="bg-slate-800 p-6 rounded-[2.5rem] mb-6 border border-slate-700">
               <p className="text-[10px] font-mono text-slate-500 mb-4 truncate">UID: {s.studentUid}</p>
               <img src={s.slipUrl} className="w-full rounded-3xl mb-6 shadow-2xl border border-slate-700 aspect-[3/4] object-cover" alt="slip"/>
               <div className="flex gap-4">
                  <Button onClick={async () => {
                     const db = getFirestore();
                     await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
                     await setDoc(doc(db, 'passes', s.studentUid), { studentUid: s.studentUid, remainingCoupons: 5, updatedAt: serverTimestamp() });
                  }} variant="success">อนุมัติ</Button>
                  <Button onClick={() => updateDoc(doc(getFirestore(), 'purchases', s.id), { status: 'rejected' })} variant="danger">ปฏิเสธ</Button>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // --- Merchant Dashboard ---
  const MerchantDashboard = () => (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-10">
      <div className="bg-orange-600 text-white p-12 pt-16 rounded-b-[4rem] shadow-xl relative overflow-hidden mb-8">
        <h2 className="text-3xl font-black italic tracking-tighter">Shop Center</h2>
        <p className="text-orange-200 text-[10px] font-bold uppercase tracking-widest mt-1">Merchant ID: {userUid?.slice(0, 10)}</p>
      </div>

      <div className="px-6 flex-1 space-y-6">
        {!userData?.isApproved ? (
          <Card className="text-center py-10 border-4 border-dashed border-orange-200">
             <Clock className="mx-auto text-orange-400 mb-4 animate-pulse" size={48}/>
             <h3 className="text-2xl font-black text-slate-800 mb-2">รอการอนุมัติร้านค้า</h3>
             <p className="text-slate-400 text-sm px-6">เจ้าหน้าที่กำลังตรวจสอบข้อมูลร้านค้าของคุณ โปรดตรวจสอบอีกครั้งในภายหลัง</p>
          </Card>
        ) : (
          <>
            <Card className="text-center bg-white border-none shadow-orange-100">
              <p className="text-slate-400 font-black text-xs uppercase mb-2">แลกคูปองแล้ววันนี้</p>
              <h2 className="text-8xl font-black text-orange-500 mb-4">{redemptions.length}</h2>
              <div className="bg-orange-600 text-white py-5 rounded-[2rem] shadow-lg">
                 <p className="text-orange-200 text-[10px] font-black uppercase mb-1">ยอดเงินสะสมที่ระบบต้องจ่าย</p>
                 <p className="text-4xl font-black">{redemptions.length * 20} ฿</p>
              </div>
            </Card>
            <Card className="bg-white border-2 border-dashed border-orange-100">
               <p className="text-slate-400 font-bold text-xs uppercase mb-4 text-center">Your QR/Shop ID (For Customer)</p>
               <div className="bg-slate-50 p-4 rounded-2xl font-mono text-xs break-all text-center text-orange-900 select-all border border-orange-50">{userUid}</div>
            </Card>
          </>
        )}
        <button onClick={handleLogout} className="w-full text-slate-300 font-black text-xs uppercase tracking-[0.2em] py-4">Logout</button>
      </div>
    </div>
  );

  // --- Purchase Flow ---
  const BuyPassView = () => {
    const [slip, setSlip] = useState<string | null>(null);
    const confirm = async () => {
      if (!slip || !userUid) return;
      setIsActionLoading(true);
      await addDoc(collection(getFirestore(), 'purchases'), { studentUid: userUid, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
      setCurrentView('student');
      setIsActionLoading(false);
    };
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-6 flex flex-col">
        <button onClick={() => setCurrentView('student')} className="mb-6 flex items-center gap-2 text-slate-400 font-bold text-sm uppercase"><ChevronLeft size={18}/> Back</button>
        <h2 className="text-3xl font-black mb-8 italic tracking-tighter">Purchase Pass</h2>
        
        <Card className="text-center mb-6 border-indigo-100 border-2">
          <p className="text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-4">Transfer 79.00 THB</p>
          <div className="bg-slate-100 aspect-square rounded-[2rem] mb-4 flex items-center justify-center border-4 border-dashed border-slate-200 overflow-hidden">
            <QrCode size={100} className="text-slate-300"/>
          </div>
          <p className="text-slate-400 font-bold text-sm">PromptPay: MFU PASS ACCOUNT</p>
        </Card>

        <Card className="flex-1 flex flex-col">
          <p className="font-black text-slate-800 mb-4">อัปโหลดสลิปเพื่อยืนยัน</p>
          <label className="flex-1 border-4 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative">
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip"/> : <div className="text-center"><Upload className="text-slate-200 mx-auto mb-2" size={48}/><p className="text-slate-300 text-[10px] font-black uppercase">Click to Select File</p></div>}
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
        <Button onClick={confirm} disabled={!slip || isActionLoading} className="mt-8">ยืนยันการซื้อ</Button>
      </div>
    );
  };

  // --- Main Logic & Fallbacks ---
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-950 font-black text-2xl tracking-tighter animate-pulse uppercase tracking-[0.2em]">MFU PASS</p>
      </div>
    );
  }

  if (currentView === 'auth') return <AuthScreen />;
  if (currentView === 'admin') return <AdminDashboard />;
  if (currentView === 'student') return <StudentDashboard />;
  if (currentView === 'guest') return <StudentDashboard />; // บุคคลทั่วไปใช้ UI เดียวกับนักศึกษาแต่แยก role ใน DB
  if (currentView === 'merchant') return <MerchantDashboard />;
  if (currentView === 'buy_pass') return <BuyPassView />;
  if (currentView === 'scan_qr') return (
    <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
       <h2 className="text-2xl font-black mb-10 tracking-tighter italic">REDEEM PASS</h2>
       <div className="w-full aspect-square border-4 border-indigo-500 rounded-[3rem] mb-12 relative flex items-center justify-center">
          <Camera size={80} className="text-slate-800" />
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 animate-bounce shadow-[0_0_20px_#6366f1]"></div>
       </div>
       <div className="w-full bg-slate-800 p-8 rounded-[2.5rem] border border-slate-700">
          <input 
            type="text" placeholder="PASTE SHOP ID" 
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const val = (e.target as any).value;
                if (val && activePass?.remainingCoupons > 0) {
                  const db = getFirestore();
                  await updateDoc(doc(db, 'passes', userUid!), { remainingCoupons: increment(-1) });
                  await addDoc(collection(db, 'redemptions'), { studentUid: userUid, merchantId: val, redeemedAt: new Date().toISOString() });
                  setCurrentView('success');
                }
              }
            }} 
            className="w-full bg-slate-900 p-5 rounded-2xl text-center font-mono text-indigo-300 border border-slate-700 outline-none focus:border-indigo-500"
          />
          <p className="text-[10px] text-slate-500 text-center mt-4 font-bold tracking-widest">ENTER ID TO CONFIRM</p>
       </div>
       <button onClick={() => setCurrentView('student')} className="mt-10 text-slate-500 font-bold uppercase text-xs">Cancel</button>
    </div>
  );

  if (currentView === 'success') return (
    <div className="min-h-screen bg-green-500 text-white p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
      <div className="bg-white text-green-500 p-8 rounded-full mb-10 shadow-2xl animate-bounce"><CheckCircle size={100}/></div>
      <h1 className="text-6xl font-black mb-6 italic tracking-tighter">DISCOUNTED!</h1>
      <div className="bg-black/10 p-8 rounded-[3rem] backdrop-blur-md mb-12 w-full border border-white/20">
         <p className="text-[10px] uppercase font-black tracking-widest mb-2 opacity-60">Verified Payment</p>
         <p className="text-6xl font-black">20 THB</p>
      </div>
      <p className="text-6xl font-mono font-black tracking-tighter mb-20">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
      <button onClick={() => setCurrentView('student')} className="w-full bg-white text-green-600 font-black py-6 rounded-3xl text-2xl shadow-2xl active:scale-95 transition-all">CLOSE</button>
    </div>
  );

  return <div className="flex-1 flex items-center justify-center bg-red-50 text-red-500 font-bold">Error: Dashboard Route Missed</div>;
}