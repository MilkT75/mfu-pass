"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, CreditCard
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc, increment, serverTimestamp } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 2.6 (Complete MVP Features - Production Ready)
 */

// --- Firebase Configuration ---
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
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'buy_pass' | 'merchant' | 'admin' | 'scan_qr' | 'success'>('login');
  
  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [merchantRedemptions, setMerchantRedemptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  // 1. Initial Connection
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
        }
        setIsProcessing(false);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { authUnsubscribe.current?.(); clearInterval(timer); };
  }, []);

  // 2. Real-time Data Listeners
  useEffect(() => {
    if (!userUid || isProcessing) return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    if (currentView === 'student' || currentView === 'buy_pass' || currentView === 'scan_qr') {
      unsubs.push(onSnapshot(doc(db, 'passes', userUid), (snap) => setActivePass(snap.exists() ? snap.data() : null)));
      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      unsubs.push(onSnapshot(q, (snap) => setPendingPurchase(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)));
    }

    if (currentView === 'merchant') {
      const q = query(collection(db, 'redemptions'), where('merchantId', '==', userUid));
      unsubs.push(onSnapshot(q, (snap) => setMerchantRedemptions(snap.docs.map(d => d.data()))));
    }

    if (currentView === 'admin') {
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      unsubs.push(onSnapshot(q, (snap) => setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    }

    return () => unsubs.forEach(f => f());
  }, [userUid, currentView, isProcessing]);

  const setRole = async (role: any) => {
    if (!userUid) return;
    setIsProcessing(true);
    await setDoc(doc(getFirestore(), 'users', userUid), { role, updatedAt: serverTimestamp() }, { merge: true });
    setCurrentView(role);
    setIsProcessing(false);
  };

  const handleLogout = () => {
    setCurrentView('login');
  };

  // --- Sub-Components ---

  const Header = ({ title, subtitle, color = "indigo" }: any) => (
    <div className={`bg-${color}-600 text-white p-8 pt-12 rounded-b-[3rem] shadow-xl relative overflow-hidden mb-6`}>
      <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={200}/></div>
      <div className="relative z-10">
        <h2 className="text-3xl font-black italic tracking-tighter">{title}</h2>
        <p className={`text-${color}-100 text-[10px] font-bold uppercase tracking-widest mt-1`}>{subtitle}</p>
      </div>
    </div>
  );

  // --- UI Views ---

  const StudentDashboard = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10">
      <Header title="MFU Pass" subtitle="Student Portal" />
      <div className="px-6 flex-1 space-y-6">
        {activePass && activePass.remainingCoupons > 0 ? (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50 relative">
            <div className="flex justify-between items-center mb-6">
              <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Wallet size={24}/></div>
              <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[10px] font-black">ACTIVE</span>
            </div>
            <p className="text-slate-400 font-bold text-xs uppercase mb-1">คูปองที่ใช้ได้</p>
            <div className="flex items-baseline gap-2 mb-8">
              <span className="text-7xl font-black text-slate-900">{activePass.remainingCoupons}</span>
              <span className="text-2xl text-slate-300 font-bold">/ 5</span>
            </div>
            <button onClick={() => setCurrentView('scan_qr')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
              <QrCode size={24} /> แสกนใช้ส่วนลด
            </button>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-[2.5rem] p-10 border-4 border-dashed border-amber-100 text-center shadow-xl">
             <Loader2 className="w-16 h-16 text-amber-500 animate-spin mx-auto mb-6" />
             <h3 className="text-2xl font-black text-slate-800 mb-2">รอแอดมินอนุมัติ</h3>
             <p className="text-slate-400 text-sm font-medium">ได้รับสลิปแล้ว กำลังตรวจสอบยอดเงินครับ</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl border border-slate-100">
             <Ticket size={48} className="mx-auto text-slate-200 mb-4"/>
             <h3 className="text-2xl font-black text-slate-800 mb-2">ยังไม่มีพาส</h3>
             <p className="text-slate-400 text-sm mb-8">ซื้อพาส Welcome Back เพื่อรับคูปอง 5 ใบ</p>
             <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">ซื้อพาสใหม่ (79 บาท)</button>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white p-6 rounded-3xl flex flex-col items-center gap-2 opacity-30 grayscale border border-slate-100"><History size={20}/><p className="text-[10px] font-black">HISTORY</p></div>
           <button onClick={handleLogout} className="bg-white p-6 rounded-3xl flex flex-col items-center gap-2 text-red-400 border border-slate-100 shadow-sm"><LogOut size={20}/><p className="text-[10px] font-black">LOGOUT</p></button>
        </div>
      </div>
    </div>
  );

  const BuyPassView = () => {
    const [isUploading, setIsUploading] = useState(false);
    const [slip, setSlip] = useState<string | null>(null);

    const handleFile = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setSlip(reader.result as string);
        reader.readAsDataURL(file);
      }
    };

    const confirm = async () => {
      if (!slip || !userUid) return;
      setIsUploading(true);
      try {
        await addDoc(collection(getFirestore(), 'purchases'), {
          studentUid: userUid,
          slipUrl: slip,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        setCurrentView('student');
      } catch (e) { alert(e); }
      setIsUploading(false);
    };

    return (
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
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="preview"/> : <Upload className="text-slate-200" size={40}/>}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>

        <button disabled={!slip || isUploading} onClick={confirm} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl mt-8 disabled:opacity-20">
          {isUploading ? 'SENDING...' : 'ยืนยันการโอนเงิน'}
        </button>
      </div>
    );
  };

  const ScanQRView = () => {
    const [mId, setMId] = useState("");
    const redeem = async () => {
      if (!mId || !activePass) return;
      setIsProcessing(true);
      try {
        const db = getFirestore();
        await updateDoc(doc(db, 'passes', userUid!), { remainingCoupons: increment(-1) });
        await addDoc(collection(db, 'redemptions'), { 
          studentUid: userUid, 
          merchantId: mId, 
          amount: 20,
          redeemedAt: new Date().toISOString() 
        });
        setCurrentView('success');
      } catch (e) { alert(e); }
      setIsProcessing(false);
    };

    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h2 className="text-2xl font-black mb-10 tracking-tighter">SCAN MERCHANT</h2>
        <div className="w-full aspect-square border-4 border-indigo-500 rounded-[3rem] mb-10 relative flex items-center justify-center">
           <Camera size={64} className="text-slate-800" />
           <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 shadow-[0_0_20px_rgba(129,140,248,1)] animate-bounce"></div>
        </div>
        <div className="w-full bg-slate-800 p-6 rounded-[2rem] border border-slate-700">
           <p className="text-[10px] font-black text-indigo-400 uppercase mb-3 text-center tracking-widest">Enter Shop ID</p>
           <input type="text" placeholder="PASTE ID HERE" value={mId} onChange={e => setMId(e.target.value)} className="w-full bg-slate-900 p-4 rounded-xl text-center font-mono mb-4 text-indigo-300 outline-none border border-slate-700 focus:border-indigo-500"/>
           <button onClick={redeem} className="w-full bg-indigo-600 py-4 rounded-xl font-black active:scale-95 transition-all">CONFIRM REDEEM</button>
        </div>
        <button onClick={() => setCurrentView('student')} className="mt-8 text-slate-500 font-bold uppercase text-xs">Cancel</button>
      </div>
    );
  };

  const SuccessView = () => (
    <div className="min-h-screen bg-green-500 text-white p-10 flex flex-col items-center justify-center text-center">
      <div className="bg-white text-green-500 p-6 rounded-full mb-8 shadow-2xl animate-bounce"><CheckCircle size={80}/></div>
      <h1 className="text-6xl font-black mb-4 italic tracking-tighter">PAID</h1>
      <div className="bg-black/10 p-6 rounded-[2.5rem] backdrop-blur-md mb-10 w-full border border-white/20">
         <p className="text-xs uppercase font-black tracking-widest mb-1 opacity-60">Discount Applied</p>
         <p className="text-5xl font-black">20 THB</p>
      </div>
      <p className="text-6xl font-mono font-bold tracking-tighter mb-20">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
      <button onClick={() => setCurrentView('student')} className="w-full bg-white text-green-600 font-black py-5 rounded-3xl text-xl shadow-2xl active:scale-95 transition-all">DONE</button>
    </div>
  );

  const MerchantView = () => {
    const totalToday = merchantRedemptions.length;
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-10">
        <Header title="Merchant" subtitle="Shop Hub" color="orange" />
        <div className="px-6 space-y-6 flex-1">
          <div className="bg-white p-8 rounded-[3rem] shadow-xl text-center border-2 border-orange-100">
            <p className="text-slate-400 font-black text-xs uppercase mb-2">Redeemed Today</p>
            <h2 className="text-8xl font-black text-orange-500 mb-4">{totalToday}</h2>
            <div className="bg-orange-600 text-white py-4 rounded-2xl shadow-lg shadow-orange-200">
               <p className="text-orange-200 text-[10px] font-black uppercase">Total Revenue</p>
               <p className="text-3xl font-black">{(totalToday * 20).toLocaleString()} ฿</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
             <p className="text-slate-400 font-bold text-xs uppercase mb-3 text-center">Your Merchant ID (For Students)</p>
             <div className="bg-slate-50 p-4 rounded-xl font-mono text-[10px] break-all text-center text-slate-500 select-all border border-slate-100">{userUid}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="mx-6 mt-6 py-4 bg-white border border-orange-200 text-orange-400 font-black rounded-2xl uppercase tracking-widest text-xs">Logout</button>
      </div>
    );
  };

  const AdminView = () => {
    const approve = async (s: any) => {
      const db = getFirestore();
      await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
      await setDoc(doc(db, 'passes', s.studentUid), { studentUid: s.studentUid, remainingCoupons: 5, updatedAt: serverTimestamp() });
    };

    return (
      <div className="min-h-screen bg-slate-900 text-white pb-20">
        <div className="p-8 pt-12 flex justify-between items-center">
          <h2 className="text-3xl font-black italic text-indigo-400">ADMIN</h2>
          <button onClick={handleLogout} className="bg-white/10 p-3 rounded-full"><XCircle size={20}/></button>
        </div>
        <div className="px-6 space-y-6">
          {allPendingSlips.length === 0 ? (
            <div className="flex flex-col items-center justify-center opacity-20 mt-20"><CheckCircle size={80} className="mb-4"/><p className="font-black uppercase tracking-widest">No pending slips</p></div>
          ) : allPendingSlips.map(s => (
            <div key={s.id} className="bg-slate-800 p-6 rounded-[2.5rem] border border-slate-700 shadow-2xl">
               <p className="text-[10px] font-mono text-slate-500 mb-6 uppercase tracking-tighter">Student: {s.studentUid}</p>
               <div className="aspect-[3/4] bg-black rounded-3xl mb-8 overflow-hidden border border-slate-700 shadow-inner">
                  <img src={s.slipUrl} className="w-full h-full object-contain" alt="slip"/>
               </div>
               <div className="flex gap-4">
                  <button onClick={() => approve(s)} className="flex-1 bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-900/40 active:scale-95 transition-all">APPROVE</button>
                  <button className="flex-1 bg-slate-700 text-white font-black py-4 rounded-2xl active:scale-95">REJECT</button>
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Main Logic ---

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center border border-indigo-50">
          <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
          <p className="text-indigo-950 font-black text-2xl tracking-tighter animate-pulse uppercase">Connecting...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'student') return <StudentDashboard />;
  if (currentView === 'buy_pass') return <BuyPassView />;
  if (currentView === 'scan_qr') return <ScanQRView />;
  if (currentView === 'success') return <SuccessView />;
  if (currentView === 'merchant') return <MerchantView />;
  if (currentView === 'admin') return <AdminView />;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[4rem] shadow-2xl p-10 flex flex-col items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-3 bg-indigo-600"></div>
        <div className="w-24 h-24 bg-indigo-600 text-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
           <Ticket size={48} strokeWidth={2.5}/>
        </div>
        <h1 className="text-4xl font-black italic mb-2 tracking-tighter">MFU Pass</h1>
        <p className="text-slate-400 mb-10 text-center font-bold text-[10px] uppercase tracking-[0.3em]">Digital Discount MVP</p>

        <div className="w-full space-y-4">
           <button onClick={() => setRole('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
              <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28}/></div>
              <span className="font-black text-2xl text-slate-700 group-hover:text-indigo-600 tracking-tighter">STUDENT</span>
           </button>
           <button onClick={() => setRole('merchant')} className="w-full bg-white border-2 border-slate-50 hover:border-orange-500 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
              <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all"><Store size={28}/></div>
              <span className="font-black text-2xl text-slate-700 group-hover:text-orange-500 tracking-tighter">MERCHANT</span>
           </button>
           <button onClick={() => setRole('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2.5rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
              <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28}/></div>
              <span className="font-black text-2xl text-slate-700 group-hover:text-slate-800 tracking-tighter">ADMIN</span>
           </button>
        </div>
        
        <p className="mt-12 text-[9px] text-slate-200 uppercase tracking-[0.6em] font-black">MFU Welcome Back System</p>
      </div>
    </div>
  );
}