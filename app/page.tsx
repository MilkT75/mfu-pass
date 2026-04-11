"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight,
  Upload, CheckCircle, XCircle, ExternalLink, Key, ChevronRight, Camera
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc, increment } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 2.1 (Full MVP: Student + Merchant + Admin + Anti-Fraud)
 */

const superClean = (val: any) => {
  if (typeof val !== 'string') return "";
  return val.trim().replace(/['" \t\n\r\u200B-\u200D\uFEFF]+/g, '');
};

const getBaseConfig = () => ({
  apiKey: superClean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: superClean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: superClean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: superClean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: superClean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: superClean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
});

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'buy_pass' | 'merchant' | 'admin' | 'scan_qr' | 'success'>('login');
  const [showDebug, setShowDebug] = useState(false);
  const [manualKey, setManualKey] = useState("");
  
  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [merchantRedemptions, setMerchantRedemptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  const connectSystem = async (customKey?: string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    if (authUnsubscribe.current) authUnsubscribe.current();

    const config = getBaseConfig();
    if (customKey) config.apiKey = superClean(customKey);

    try {
      let app = getApps().length === 0 ? initializeApp(config) : getApp();
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
          signInAnonymously(auth).catch((err) => {
            setErrorMessage(err.message.includes('api-key-not-valid') ? "API Key ยังไม่ถูกต้อง: โปรดตั้งค่า 'Application restrictions' เป็น 'None' ใน Google Cloud" : err.message);
            setIsProcessing(false);
          });
        }
      });
    } catch (err: any) {
      setErrorMessage(err.message);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    connectSystem();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { if (authUnsubscribe.current) authUnsubscribe.current(); clearInterval(timer); };
  }, []);

  // Listeners
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
    try { await setDoc(doc(getFirestore(), 'users', userUid), { role }, { merge: true }); setCurrentView(role); } 
    catch (e: any) { setErrorMessage(e.message); }
    setIsProcessing(false);
  };

  // --- UI Views ---

  const StudentView = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="bg-indigo-600 text-white p-10 rounded-b-[3.5rem] shadow-xl">
        <h2 className="text-3xl font-black italic mb-1">MFU Pass</h2>
        <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Student Portal</p>
      </div>
      <div className="p-6 -mt-8 space-y-6">
        {activePass && activePass.remainingCoupons > 0 ? (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50">
            <p className="text-slate-400 font-bold text-[10px] uppercase mb-1">คูปองคงเหลือ</p>
            <h3 className="text-6xl font-black text-slate-900 mb-8">{activePass.remainingCoupons} <span className="text-lg text-slate-200">/ 5</span></h3>
            <button onClick={() => setCurrentView('scan_qr')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl">
               <QrCode size={24}/> แสกนเพื่อรับส่วนลด
            </button>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl border-4 border-dashed border-amber-100">
             <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
             <p className="font-bold text-slate-800">รอแอดมินอนุมัติสลิป</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl">
             <Ticket size={48} className="mx-auto text-slate-200 mb-4"/>
             <h3 className="text-xl font-bold mb-2 text-slate-800">ยังไม่มีพาส</h3>
             <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl mt-4">ซื้อพาสใหม่ (79 บาท)</button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-50 flex flex-col items-center opacity-40 grayscale"><History size={20}/><p className="text-[10px] font-bold mt-2">ประวัติ</p></div>
          <button onClick={() => setCurrentView('login')} className="bg-white p-6 rounded-3xl border border-slate-50 flex flex-col items-center"><Settings2 size={20}/><p className="text-[10px] font-bold mt-2">LOGOUT</p></button>
        </div>
      </div>
    </div>
  );

  const ScanQRView = () => {
    const [mId, setMId] = useState("");
    const handleRedeem = async () => {
      if (!mId || !activePass) return;
      setIsProcessing(true);
      try {
        const db = getFirestore();
        await updateDoc(doc(db, 'passes', userUid!), { remainingCoupons: increment(-1) });
        await addDoc(collection(db, 'redemptions'), { studentUid: userUid, merchantId: mId, redeemedAt: new Date().toISOString() });
        setCurrentView('success');
      } catch (e) { alert(e); }
      setIsProcessing(false);
    };
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h2 className="text-2xl font-black mb-10">Scan Merchant QR</h2>
        <div className="w-full aspect-square border-4 border-indigo-500 rounded-3xl mb-8 relative flex items-center justify-center overflow-hidden">
           <Camera size={64} className="text-slate-700"/>
           <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)] animate-bounce"></div>
        </div>
        <input type="text" placeholder="Enter Merchant ID" value={mId} onChange={e => setMId(e.target.value)} className="w-full bg-slate-800 p-4 rounded-xl mb-4 text-center font-mono"/>
        <button onClick={handleRedeem} className="w-full bg-indigo-600 py-4 rounded-xl font-black">CONFIRM USAGE</button>
        <button onClick={() => setCurrentView('student')} className="mt-6 text-slate-500">Cancel</button>
      </div>
    );
  };

  const SuccessView = () => (
    <div className="min-h-screen bg-green-500 text-white p-10 flex flex-col items-center justify-center text-center">
      <div className="bg-white text-green-500 p-6 rounded-full mb-8 shadow-2xl animate-bounce"><CheckCircle size={80}/></div>
      <h1 className="text-6xl font-black mb-4">SUCCESS</h1>
      <div className="bg-black/20 p-6 rounded-3xl backdrop-blur-md mb-10 w-full max-w-xs border border-white/20">
         <p className="text-xs uppercase font-bold tracking-widest mb-1 opacity-60">Discount Applied</p>
         <p className="text-4xl font-black">20 THB</p>
      </div>
      <p className="text-5xl font-mono font-bold tracking-tighter mb-20">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
      <button onClick={() => setCurrentView('student')} className="w-full bg-white text-green-600 font-black py-5 rounded-3xl text-xl shadow-2xl">DONE</button>
    </div>
  );

  const MerchantView = () => (
    <div className="min-h-screen bg-orange-50 p-6 flex flex-col font-sans">
      <div className="bg-white p-8 rounded-[3rem] shadow-xl text-center mb-6">
        <p className="text-slate-400 font-bold text-xs uppercase mb-2">Redeemed Today</p>
        <h2 className="text-7xl font-black text-orange-500 mb-2">{merchantRedemptions.length}</h2>
        <p className="text-slate-400 text-sm">Coupons</p>
      </div>
      <div className="bg-orange-600 text-white p-6 rounded-3xl mb-10 shadow-lg">
         <p className="text-orange-200 text-[10px] font-black uppercase mb-1">Total Owed</p>
         <p className="text-3xl font-black">{(merchantRedemptions.length * 20).toLocaleString()} THB</p>
      </div>
      <div className="mt-auto bg-white p-6 rounded-3xl border-2 border-dashed border-orange-200 text-center">
         <p className="text-xs text-slate-400 mb-2">Your Merchant ID:</p>
         <p className="font-mono text-[10px] bg-slate-50 p-2 rounded break-all">{userUid}</p>
      </div>
      <button onClick={() => setCurrentView('login')} className="mt-6 text-orange-400 font-bold">Logout</button>
    </div>
  );

  if (isProcessing && !errorMessage) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-950 font-black text-2xl animate-pulse">CONNECTING...</p>
      </div>
    </div>;
  }

  if (currentView === 'student') return <StudentView />;
  if (currentView === 'scan_qr') return <ScanQRView />;
  if (currentView === 'success') return <SuccessView />;
  if (currentView === 'merchant') return <MerchantView />;
  if (currentView === 'admin') return (
    <div className="min-h-screen bg-slate-900 text-white p-8 overflow-y-auto">
      <div className="flex justify-between items-center mb-10"><h2 className="text-2xl font-black italic">Admin</h2><button onClick={() => setCurrentView('login')}><XCircle/></button></div>
      {allPendingSlips.length === 0 ? <p className="text-center opacity-20 mt-20">No tasks</p> : allPendingSlips.map(s => (
        <div key={s.id} className="bg-slate-800 p-6 rounded-3xl mb-4 border border-slate-700">
           <img src={s.slipUrl} className="w-full rounded-2xl mb-4" alt="slip"/>
           <button onClick={async () => {
             const db = getFirestore();
             await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
             await setDoc(doc(db, 'passes', s.studentUid), { studentUid: s.studentUid, remainingCoupons: 5 });
           }} className="w-full bg-green-500 py-4 rounded-xl font-black">APPROVE</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl p-10 flex flex-col items-center relative">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100"><Ticket size={40}/></div>
        <h1 className="text-3xl font-black italic mb-10 tracking-tighter">MFU Pass MVP</h1>
        
        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2rem] mb-8 animate-in fade-in zoom-in">
            <div className="flex items-center gap-2 text-red-600 font-bold mb-2"><ShieldAlert size={20}/><span>System Error</span></div>
            <p className="text-[10px] text-red-900/70 font-bold italic mb-4 leading-relaxed">{errorMessage}</p>
            <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] underline text-red-400 block mx-auto">{showDebug ? 'Close' : 'Fix with Manual Key'}</button>
            {showDebug && (
              <div className="mt-4 space-y-2">
                <input type="text" placeholder="Paste API Key here" value={manualKey} onChange={e => setManualKey(e.target.value)} className="w-full bg-slate-900 text-white p-3 rounded-xl text-[10px] outline-none border border-slate-700"/>
                <button onClick={() => connectSystem(manualKey)} className="w-full bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase">Reconnect Now</button>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none grayscale blur-[1px]' : ''}`}>
          <button onClick={() => setRole('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm"><User size={28}/><span className="font-black text-xl">Student</span></button>
          <button onClick={() => setRole('merchant')} className="w-full bg-white border-2 border-slate-50 hover:border-orange-500 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm"><Store size={28}/><span className="font-black text-xl">Merchant</span></button>
          <button onClick={() => setRole('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm"><ShieldCheck size={28}/><span className="font-black text-xl">Admin</span></button>
        </div>
      </div>
    </div>
  );
}