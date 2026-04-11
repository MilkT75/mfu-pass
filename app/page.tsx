"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight,
  Upload, CheckCircle, XCircle, ExternalLink, Key, ChevronRight, Camera, RefreshCw
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc, increment } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 2.2 (System Recovery & Connectivity Tester)
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
      // ตรวจสอบว่ามี Instance อยู่แล้วหรือไม่เพื่อทำการ Reset
      let app;
      if (getApps().length > 0) {
        app = getApp();
        // หากมีการเปลี่ยน Key ต้องลบ App เดิมออกก่อนในบางกรณี แต่ใน Client-side เราจะใช้วิธี Init ใหม่ถ้าจำเป็น
        if (customKey) app = initializeApp(config, "temp-app-" + Date.now());
      } else {
        app = initializeApp(config);
      }

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
            console.error("Auth Error:", err.code);
            if (err.code === 'auth/api-key-not-valid' || err.message.includes('API key not valid')) {
              setErrorMessage("API Key ถูกจำกัดสิทธิ์: โปรดเลือก 'Don't restrict key' ใน Google Cloud แล้วกด Save");
            } else {
              setErrorMessage(err.message);
            }
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

  if (isProcessing && !errorMessage) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-center">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-950 font-black text-2xl animate-pulse">กำลังเชื่อมต่อ...</p>
        <p className="text-slate-400 text-sm mt-2 font-medium">โปรดรอประมาณ 5-10 วินาที</p>
      </div>
    </div>;
  }

  // View dashboards
  if (currentView === 'student') return (
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
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl">
             <Ticket size={48} className="mx-auto text-slate-200 mb-4"/>
             <h3 className="text-xl font-bold mb-2 text-slate-800">ยังไม่มีพาส</h3>
             <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl mt-4">ซื้อพาสใหม่ (79 บาท)</button>
          </div>
        )}
        <button onClick={() => setCurrentView('login')} className="w-full text-center text-slate-300 font-bold text-xs uppercase tracking-widest mt-10">Logout</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl p-10 flex flex-col items-center relative overflow-hidden">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100 transition-transform hover:scale-105">
          <Ticket size={40} />
        </div>
        <h1 className="text-3xl font-black italic mb-2 tracking-tighter">MFU Pass MVP</h1>
        <p className="text-slate-300 mb-10 text-center font-bold text-[10px] uppercase tracking-[0.4em]">ระบบจัดการคูปองโรงอาหาร</p>
        
        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2.5rem] mb-8 animate-in fade-in zoom-in">
            <div className="flex items-center gap-3 text-red-600 font-black mb-3">
              <ShieldAlert size={24}/>
              <span className="text-lg">การเชื่อมต่อผิดพลาด</span>
            </div>
            <p className="text-[11px] text-red-950 font-bold italic mb-4 leading-relaxed bg-white/50 p-4 rounded-2xl border border-red-50">
              {errorMessage}
            </p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => connectSystem()} 
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-200 active:scale-95 transition-all"
              >
                <RefreshCw size={18} /> ทดสอบการเชื่อมต่อใหม่
              </button>
              
              <button 
                onClick={() => setShowDebug(!showDebug)} 
                className="text-[10px] underline text-slate-400 font-bold uppercase tracking-widest mx-auto py-2"
              >
                {showDebug ? 'ซ่อน' : 'วิธีแก้ & ใส่ Key ด้วยตนเอง'}
              </button>
            </div>

            {showDebug && (
              <div className="mt-4 space-y-3 bg-slate-900 p-6 rounded-[2rem] text-slate-300">
                <p className="text-[10px] text-amber-400 font-bold">1. แก้ที่ Google Cloud:</p>
                <p className="text-[9px] leading-relaxed opacity-70">เหนือช่อง "2 APIs" ให้ติ๊กวงกลมที่หน้าคำว่า <span className="text-white font-bold">"Don't restrict key"</span> แล้วกด <span className="text-white font-bold">Save</span></p>
                
                <div className="border-t border-slate-800 pt-4">
                  <p className="text-[10px] text-indigo-400 font-bold mb-2">2. ทดสอบด้วย Key ตัวอื่น:</p>
                  <input 
                    type="text" 
                    placeholder="วาง API Key (AIza...) ที่นี่" 
                    value={manualKey} 
                    onChange={e => setManualKey(e.target.value)} 
                    className="w-full bg-slate-800 text-white p-3 rounded-xl text-[10px] outline-none border border-slate-700 focus:border-indigo-500 mb-2"
                  />
                  <button onClick={() => connectSystem(manualKey)} className="w-full bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase">Reconnect with this key</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none grayscale blur-[2px]' : ''}`}>
          <button onClick={() => setRole('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28}/></div>
            <span className="font-black text-xl text-slate-700 group-hover:text-indigo-600">Student</span>
          </button>
          <button onClick={() => setRole('merchant')} className="w-full bg-white border-2 border-slate-50 hover:border-orange-500 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
            <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-all"><Store size={28}/></div>
            <span className="font-black text-xl text-slate-700 group-hover:text-orange-500">Merchant</span>
          </button>
          <button onClick={() => setRole('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-95 transition-all group">
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28}/></div>
            <span className="font-black text-xl text-slate-700 group-hover:text-slate-900">Admin</span>
          </button>
        </div>
        
        <p className="mt-12 text-[9px] text-slate-200 uppercase tracking-[0.6em] font-black">MFU v2.2 Recovery Build</p>
      </div>
    </div>
  );
}