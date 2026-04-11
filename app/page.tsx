"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn
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
 * เวอร์ชัน: 2.7 (Real Email/Pass Auth + Personal Data Isolation)
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_select'>('login');
  const [currentView, setCurrentView] = useState<'auth' | 'student' | 'buy_pass' | 'merchant' | 'admin' | 'scan_qr' | 'success'>('auth');
  
  // Auth Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [merchantRedemptions, setMerchantRedemptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    authUnsubscribe.current = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUserUid(currentUser.uid);
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (userSnap.exists() && userSnap.data().role) {
          setCurrentView(userSnap.data().role);
        } else {
          setAuthMode('role_select');
          setCurrentView('auth');
        }
      } else {
        setUserUid(null);
        setCurrentView('auth');
        setAuthMode('login');
      }
      setIsProcessing(false);
    });

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { authUnsubscribe.current?.(); clearInterval(timer); };
  }, []);

  // Listener สำหรับข้อมูล (แยกตาม uid ของผู้ใช้)
  useEffect(() => {
    if (!userUid || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    if (currentView === 'student' || currentView === 'buy_pass' || currentView === 'scan_qr') {
      // ดึงพาสส่วนตัวของฉัน
      unsubs.push(onSnapshot(doc(db, 'passes', userUid), (snap) => setActivePass(snap.exists() ? snap.data() : null)));
      // ดึงรายการซื้อที่รอแอดมินตรวจของฉัน
      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      unsubs.push(onSnapshot(q, (snap) => setPendingPurchase(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)));
    }

    if (currentView === 'merchant') {
      // ดึงยอดขายของร้านค้าฉัน
      const q = query(collection(db, 'redemptions'), where('merchantId', '==', userUid));
      unsubs.push(onSnapshot(q, (snap) => setMerchantRedemptions(snap.docs.map(d => d.data()))));
    }

    if (currentView === 'admin') {
      // ดึงสลิปทั้งหมด (เฉพาะแอดมินเห็น)
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      unsubs.push(onSnapshot(q, (snap) => setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    }

    return () => unsubs.forEach(f => f());
  }, [userUid, currentView]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMsg("");
    const auth = getAuth();
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setIsProcessing(false);
    }
  };

  const handleRoleSelection = async (role: string) => {
    if (!userUid) return;
    setIsProcessing(true);
    await setDoc(doc(getFirestore(), 'users', userUid), { role, email, updatedAt: serverTimestamp() }, { merge: true });
    setCurrentView(role as any);
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    setIsProcessing(true);
    await signOut(getAuth());
    setEmail("");
    setPassword("");
  };

  // --- UI Components ---

  const AuthScreen = () => (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[4rem] shadow-2xl p-10 flex flex-col items-center border border-white">
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
           <Ticket size={48} strokeWidth={2.5}/>
        </div>
        <h1 className="text-4xl font-black italic mb-2 tracking-tighter">MFU Pass</h1>
        
        {authMode === 'role_select' ? (
          <div className="w-full space-y-6 mt-6 animate-in fade-in zoom-in duration-500">
            <p className="text-slate-400 text-center font-bold text-sm uppercase tracking-widest mb-4">ยินดีต้อนรับ! โปรดเลือกบทบาทของคุณ</p>
            <div className="space-y-3">
              <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-indigo-50 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
                <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28}/></div>
                <span className="font-black text-2xl text-slate-700 group-hover:text-indigo-600 tracking-tighter uppercase">Student</span>
              </button>
              <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white border-2 border-orange-50 hover:border-orange-500 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
                <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all"><Store size={28}/></div>
                <span className="font-black text-2xl text-slate-700 group-hover:text-orange-500 tracking-tighter uppercase">Merchant</span>
              </button>
              <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
                <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28}/></div>
                <span className="font-black text-2xl text-slate-700 group-hover:text-slate-800 tracking-tighter uppercase">Admin</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAuth} className="w-full space-y-4 mt-8 animate-in fade-in slide-in-from-bottom-4">
            <p className="text-slate-400 text-center font-bold text-xs uppercase tracking-widest mb-6">
              {authMode === 'login' ? 'เข้าสู่ระบบด้วยบัญชีของคุณ' : 'สร้างบัญชีใหม่เพื่อเริ่มใช้งาน'}
            </p>
            
            {errorMsg && <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-xs font-bold border border-red-100 mb-4">{errorMsg}</div>}

            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={20}/>
              <input 
                type="email" 
                placeholder="อีเมลแอดเดรส" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-50 p-5 pl-14 rounded-3xl outline-none focus:border-indigo-500 focus:bg-white transition-all font-bold text-slate-700"
                required
              />
            </div>
            
            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={20}/>
              <input 
                type="password" 
                placeholder="รหัสผ่าน" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-50 p-5 pl-14 rounded-3xl outline-none focus:border-indigo-500 focus:bg-white transition-all font-bold text-slate-700"
                required
              />
            </div>

            <button type="submit" className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all">
              {authMode === 'login' ? <LogIn size={20}/> : <UserPlus size={20}/>}
              {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>

            <button 
              type="button"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="w-full text-center text-slate-400 font-bold text-xs uppercase tracking-widest mt-4 hover:text-indigo-500 transition-colors"
            >
              {authMode === 'login' ? 'Don\'t have an account? Sign Up' : 'Already have an account? Log In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  // --- Views for Student, Merchant, Admin (Same logic as v2.6 but with Logout) ---
  const StudentDashboard = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-10">
       <div className="bg-indigo-600 text-white p-10 rounded-b-[3.5rem] shadow-xl relative overflow-hidden mb-6">
        <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={200}/></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black italic tracking-tighter">MFU Pass</h2>
          <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-1">Student: {email}</p>
        </div>
      </div>
      <div className="px-6 flex-1 space-y-6">
        {activePass && activePass.remainingCoupons > 0 ? (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50 relative">
            <p className="text-slate-400 font-bold text-xs uppercase mb-1">คูปองที่ใช้ได้</p>
            <div className="flex items-baseline gap-2 mb-8"><span className="text-7xl font-black text-slate-900">{activePass.remainingCoupons}</span><span className="text-2xl text-slate-300 font-bold">/ 5</span></div>
            <button onClick={() => setCurrentView('scan_qr')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"><QrCode size={24}/> แสกนจ่าย</button>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-[2.5rem] p-10 border-4 border-dashed border-amber-100 text-center shadow-xl">
             <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-6" />
             <p className="font-bold text-slate-800">รอแอดมินอนุมัติสลิป...</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl border border-slate-100">
             <Ticket size={48} className="mx-auto text-slate-200 mb-4"/>
             <h3 className="text-2xl font-black text-slate-800 mb-2">ยังไม่มีพาส</h3>
             <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg mt-4">ซื้อพาสใหม่ (79 บาท)</button>
          </div>
        )}
        <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-400 font-black text-xs uppercase tracking-widest py-4"><LogOut size={16}/> Logout</button>
      </div>
    </div>
  );

  // Success, Merchant, Admin, BuyPass views remain structurally similar but connected to Auth UID
  // ... (Full code included for single-file mandate)

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center border border-indigo-50">
          <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
          <p className="text-indigo-950 font-black text-2xl tracking-tighter animate-pulse uppercase tracking-widest">MFU Pass Loading...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'auth') return <AuthScreen />;
  if (currentView === 'student') return <StudentDashboard />;
  if (currentView === 'buy_pass') return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col">
      <button onClick={() => setCurrentView('student')} className="mb-6 flex items-center gap-2 text-slate-400 font-bold text-sm"><ChevronLeft size={18}/> BACK</button>
      <h2 className="text-3xl font-black mb-8 italic tracking-tighter">Purchase</h2>
      <div className="bg-white rounded-[3rem] p-8 shadow-xl mb-6 text-center border-2 border-indigo-50 flex flex-col items-center">
        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-4">Transfer 79 THB</p>
        <div className="w-full aspect-square bg-slate-100 rounded-3xl mb-4 flex items-center justify-center border-4 border-dashed border-slate-200">
          <QrCode size={64} className="text-slate-300"/>
        </div>
        <p className="text-indigo-600 font-black text-sm uppercase">PromptPay: MFU PASS</p>
      </div>
      <div className="bg-white rounded-[3rem] p-8 shadow-xl flex-1 flex flex-col">
        <p className="font-black text-slate-800 mb-4">อัปโหลดสลิป</p>
        <label className="flex-1 border-4 border-dashed border-slate-50 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative">
          <Upload className="text-slate-200" size={40}/>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const r = new FileReader();
              r.onloadend = async () => {
                await addDoc(collection(getFirestore(), 'purchases'), { studentUid: userUid, slipUrl: r.result, status: 'pending', createdAt: new Date().toISOString() });
                setCurrentView('student');
              };
              r.readAsDataURL(file);
            }
          }} />
        </label>
      </div>
    </div>
  );
  if (currentView === 'scan_qr') return (
    <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
       <h2 className="text-2xl font-black mb-10 tracking-tighter">SCAN MERCHANT</h2>
       <div className="w-full aspect-square border-4 border-indigo-500 rounded-[3rem] mb-10 relative flex items-center justify-center">
          <Camera size={64} className="text-slate-800" />
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 animate-bounce shadow-[0_0_20px_#6366f1]"></div>
       </div>
       <div className="w-full bg-slate-800 p-6 rounded-[2rem]">
          <input type="text" placeholder="Enter Shop ID" onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = (e.target as any).value;
              if (val) {
                const db = getFirestore();
                updateDoc(doc(db, 'passes', userUid!), { remainingCoupons: increment(-1) });
                addDoc(collection(db, 'redemptions'), { studentUid: userUid, merchantId: val, amount: 20, redeemedAt: new Date().toISOString() });
                setCurrentView('success');
              }
            }
          }} className="w-full bg-slate-900 p-4 rounded-xl text-center font-mono text-indigo-300 border border-slate-700"/>
          <p className="text-[10px] text-slate-500 text-center mt-3">Press Enter to Confirm</p>
       </div>
       <button onClick={() => setCurrentView('student')} className="mt-8 text-slate-500 font-bold uppercase text-xs">Cancel</button>
    </div>
  );
  if (currentView === 'success') return (
    <div className="min-h-screen bg-green-500 text-white p-10 flex flex-col items-center justify-center text-center">
      <div className="bg-white text-green-500 p-6 rounded-full mb-8 shadow-2xl animate-bounce"><CheckCircle size={80}/></div>
      <h1 className="text-6xl font-black mb-4 italic tracking-tighter">PAID</h1>
      <p className="text-6xl font-mono font-bold tracking-tighter mb-20">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
      <button onClick={() => setCurrentView('student')} className="w-full bg-white text-green-600 font-black py-5 rounded-3xl text-xl shadow-2xl">DONE</button>
    </div>
  );
  if (currentView === 'merchant') return (
    <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-10">
      <div className="bg-orange-600 text-white p-10 rounded-b-[3.5rem] shadow-xl relative overflow-hidden mb-6">
        <h2 className="text-3xl font-black italic tracking-tighter">Merchant</h2>
        <p className="text-orange-100 text-[10px] font-bold uppercase mt-1">Shop ID: {userUid?.slice(0, 10)}...</p>
      </div>
      <div className="px-6 space-y-6 flex-1">
        <div className="bg-white p-8 rounded-[3rem] shadow-xl text-center border-2 border-orange-100">
          <p className="text-slate-400 font-black text-xs uppercase mb-2">Redeemed Today</p>
          <h2 className="text-8xl font-black text-orange-500 mb-4">{merchantRedemptions.length}</h2>
          <div className="bg-orange-600 text-white py-4 rounded-2xl shadow-lg">
             <p className="text-orange-200 text-[10px] font-black uppercase">Owed Balance</p>
             <p className="text-3xl font-black">{merchantRedemptions.length * 20} ฿</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
           <p className="text-slate-400 font-bold text-xs uppercase mb-3 text-center">Your Merchant ID</p>
           <div className="bg-slate-50 p-4 rounded-xl font-mono text-[10px] break-all text-center text-slate-500 border border-slate-100 select-all">{userUid}</div>
        </div>
      </div>
      <button onClick={handleLogout} className="mx-6 mt-6 py-4 bg-white border border-orange-200 text-orange-400 font-black rounded-2xl uppercase tracking-widest text-xs">Logout</button>
    </div>
  );
  if (currentView === 'admin') return (
    <div className="min-h-screen bg-slate-900 text-white pb-20">
      <div className="p-8 pt-12 flex justify-between items-center"><h2 className="text-3xl font-black italic text-indigo-400">ADMIN</h2><button onClick={handleLogout} className="bg-white/10 p-3 rounded-full"><XCircle size={20}/></button></div>
      <div className="px-6 space-y-6">
        {allPendingSlips.length === 0 ? <p className="text-center opacity-20 mt-20">No pending tasks</p> : allPendingSlips.map(s => (
          <div key={s.id} className="bg-slate-800 p-6 rounded-[2.5rem] border border-slate-700 shadow-2xl">
             <p className="text-[10px] font-mono text-slate-500 mb-4">Student: {s.studentUid.slice(0,10)}...</p>
             <img src={s.slipUrl} className="w-full rounded-3xl mb-6 shadow-inner" alt="slip"/>
             <div className="flex gap-4">
                <button onClick={() => {
                  updateDoc(doc(getFirestore(), 'purchases', s.id), { status: 'approved' });
                  setDoc(doc(getFirestore(), 'passes', s.studentUid), { studentUid: s.studentUid, remainingCoupons: 5, updatedAt: serverTimestamp() });
                }} className="flex-1 bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-900/40">APPROVE</button>
                <button className="flex-1 bg-slate-700 text-white font-black py-4 rounded-2xl">REJECT</button>
             </div>
          </div>
        ))}
      </div>
    </div>
  );

  return <div className="flex-1 flex items-center justify-center">Error: View Not Found</div>;
}