"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight,
  Upload, CheckCircle, XCircle, ExternalLink, RefreshCw, Key
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 1.9 (Build Error Fix + Stable Connectivity)
 */

// ฟังก์ชันล้างค่าตัวแปรสภาพแวดล้อมให้บริสุทธิ์ที่สุด
const getCleanEnv = (key: string | undefined): string => {
  if (!key) return "";
  return key.replace(/['" \t\n\r]+/g, '').trim();
};

const getFirebaseConfig = (manualKey?: string) => ({
  apiKey: manualKey || getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: getCleanEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
});

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'buy_pass' | 'merchant' | 'admin'>('login');
  const [showDebug, setShowDebug] = useState(false);
  const [manualKey, setManualKey] = useState("");
  const [diagnostics, setDiagnostics] = useState<Record<string, string>>({});
  
  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);

  // ใช้ Ref เพื่อเก็บตัวล้าง Listener
  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  const startFirebase = async (customKey?: string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    
    // เคลียร์ Listener เดิมถ้ามี
    if (authUnsubscribe.current) {
      authUnsubscribe.current();
      authUnsubscribe.current = null;
    }

    const config = getFirebaseConfig(customKey);
    
    // อัปเดตข้อมูลวินิจฉัย
    const diag: Record<string, string> = {};
    Object.entries(config).forEach(([key, val]) => {
      diag[key] = val ? `✅ [${val.slice(0, 4)}...${val.slice(-4)}] (${val.length})` : "❌ ว่างเปล่า";
    });
    setDiagnostics(diag);

    if (!config.apiKey) {
      setErrorMessage("ไม่พบ API Key ในระบบ (Undefined)");
      setIsProcessing(false);
      return;
    }

    try {
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      const auth = getAuth(app);
      const db = getFirestore(app);

      authUnsubscribe.current = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUserUid(currentUser.uid);
          try {
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userSnap.exists() && userSnap.data().role) {
              setCurrentView(userSnap.data().role);
            }
          } catch (e) { console.error("User Role Error:", e); }
          setIsProcessing(false);
        } else {
          signInAnonymously(auth).catch((err) => {
            setErrorMessage(`Firebase Auth Error: ${err.message}`);
            setIsProcessing(false);
          });
        }
      });
    } catch (err: any) {
      setErrorMessage(`Firebase Init Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    startFirebase();
    return () => {
      if (authUnsubscribe.current) authUnsubscribe.current();
    };
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!userUid || isProcessing) return;
    const db = getFirestore();

    const unsubscribes: Unsubscribe[] = [];

    if (currentView === 'student' || currentView === 'buy_pass') {
      const unsub1 = onSnapshot(doc(db, 'passes', userUid), (snap) => {
        if (snap.exists()) setActivePass(snap.data());
      });
      unsubscribes.push(unsub1);

      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      const unsub2 = onSnapshot(q, (snap) => {
        if (!snap.empty) setPendingPurchase({ id: snap.docs[0].id, ...snap.docs[0].data() });
        else setPendingPurchase(null);
      });
      unsubscribes.push(unsub2);
    }

    if (currentView === 'admin') {
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      const unsub3 = onSnapshot(q, (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      unsubscribes.push(unsub3);
    }

    return () => unsubscribes.forEach(fn => fn());
  }, [userUid, currentView, isProcessing]);

  const handleRoleSelection = async (role: any) => {
    if (!userUid) return;
    setIsProcessing(true);
    try {
      await setDoc(doc(getFirestore(), 'users', userUid), { role }, { merge: true });
      setCurrentView(role);
    } catch (e: any) { setErrorMessage(`ไม่สามารถเลือกบทบาทได้: ${e.message}`); }
    setIsProcessing(false);
  };

  // --- UI Views ---

  const StudentDashboard = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20">
      <div className="bg-indigo-600 text-white p-10 rounded-b-[4rem] shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <Ticket className="opacity-50" size={32} />
          <button onClick={() => setCurrentView('login')} className="bg-white/10 p-3 rounded-2xl"><Settings2 size={20}/></button>
        </div>
        <h2 className="text-4xl font-black italic tracking-tighter">MFU Pass</h2>
        <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] mt-1">Student Portal</p>
      </div>

      <div className="px-6 -mt-10 space-y-6">
        {activePass ? (
          <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-indigo-50">
             <div className="flex justify-between mb-6">
               <div className="bg-indigo-50 text-indigo-600 p-4 rounded-3xl"><Wallet size={24}/></div>
               <span className="bg-green-100 text-green-600 px-4 py-1 rounded-full text-[10px] font-black h-fit">ACTIVE</span>
             </div>
             <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">คูปองคงเหลือ</p>
             <div className="flex items-baseline gap-2 mb-8 font-black">
                <span className="text-7xl text-slate-900">{activePass.remainingCoupons}</span>
                <span className="text-2xl text-slate-300">/ 5</span>
             </div>
             <button className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
               <QrCode size={24}/> ใช้คูปอง
             </button>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-[3rem] p-10 text-center shadow-xl border-4 border-dashed border-amber-100">
             <Loader2 className="w-16 h-16 text-amber-500 animate-spin mx-auto mb-6" />
             <h3 className="text-2xl font-black text-slate-800 mb-2">รออนุมัติสลิป</h3>
             <p className="text-slate-400 text-sm font-medium">แอดมินกำลังตรวจสอบการโอนเงินของคุณ</p>
          </div>
        ) : (
          <div className="bg-white rounded-[3rem] p-10 text-center shadow-xl border border-slate-100">
             <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6"><Ticket size={40}/></div>
             <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">คุณยังไม่มีพาส</h3>
             <p className="text-slate-400 text-sm mb-8 font-medium px-4">ซื้อ Welcome Back Pass เพื่อรับคูปองส่วนลด 5 ใบ</p>
             <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100">
                ซื้อพาสใหม่ (79 บาท)
             </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white p-6 rounded-[2rem] flex flex-col items-center gap-2 text-slate-300 border border-slate-50"><History size={20}/><p className="text-[10px] font-black">ประวัติ</p></div>
           <div className="bg-white p-6 rounded-[2rem] flex flex-col items-center gap-2 text-slate-300 border border-slate-50"><Info size={20}/><p className="text-[10px] font-black">วิธีใช้</p></div>
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

    const handleConfirm = async () => {
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
      } catch (e: any) { setErrorMessage(e.message); }
      setIsUploading(false);
    };

    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col font-sans">
        <h2 className="text-3xl font-black mb-8 italic tracking-tighter">Purchase Pass</h2>
        <div className="bg-white rounded-[3rem] p-8 shadow-xl text-center mb-6 border-2 border-indigo-50">
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-4">Transfer 79 THB</p>
          <div className="w-full aspect-square bg-slate-100 rounded-[2rem] mb-4 flex items-center justify-center border-4 border-dashed border-slate-200">
            <QrCode size={64} className="text-slate-300"/>
          </div>
          <p className="text-indigo-600 font-black text-sm">PROMPTPAY MFU PASS</p>
        </div>
        <div className="bg-white rounded-[3rem] p-8 shadow-xl flex-1 flex flex-col">
          <p className="font-black text-slate-800 mb-4">Upload Transfer Slip</p>
          <label className="flex-1 border-4 border-dashed border-slate-50 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative">
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="Slip"/> : (
              <><Upload className="text-slate-200 mb-2" size={32}/><p className="text-slate-300 text-[10px] font-black">TAP TO UPLOAD</p></>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile}/>
          </label>
        </div>
        <div className="mt-8 space-y-3">
          <button disabled={!slip || isUploading} onClick={handleConfirm} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 disabled:opacity-30 transition-all">
             {isUploading ? 'SENDING...' : 'CONFIRM PURCHASE'}
          </button>
          <button onClick={() => setCurrentView('student')} className="w-full py-4 text-slate-300 font-bold text-xs uppercase tracking-widest">Cancel</button>
        </div>
      </div>
    );
  };

  const AdminView = () => {
    const approve = async (s: any) => {
      try {
        const db = getFirestore();
        await updateDoc(doc(db, 'purchases', s.id), { status: 'approved' });
        await setDoc(doc(db, 'passes', s.studentUid), {
          studentUid: s.studentUid,
          remainingCoupons: 5,
          totalCoupons: 5,
          updatedAt: new Date().toISOString()
        });
      } catch (e: any) { alert(e.message); }
    };

    return (
      <div className="min-h-screen bg-slate-900 p-6 flex flex-col font-sans text-white pb-20">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-black italic tracking-tighter text-indigo-400">Admin Panel</h2>
          <button onClick={() => setCurrentView('login')} className="bg-white/10 p-3 rounded-full"><XCircle size={20}/></button>
        </div>
        {allPendingSlips.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20"><CheckCircle size={100} className="mb-4"/><p className="font-black tracking-[0.3em] uppercase">No Pending Tasks</p></div>
        ) : (
          <div className="space-y-6">
             {allPendingSlips.map(s => (
               <div key={s.id} className="bg-slate-800 rounded-[2.5rem] p-8 border border-slate-700">
                  <p className="text-[10px] font-mono text-slate-500 mb-6">User: {s.studentUid.slice(0,12)}...</p>
                  <div className="aspect-[3/4] bg-black rounded-3xl mb-8 overflow-hidden border border-slate-700 shadow-inner">
                     <img src={s.slipUrl} className="w-full h-full object-contain" alt="Slip"/>
                  </div>
                  <div className="flex gap-4">
                     <button onClick={() => approve(s)} className="flex-1 bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-900/40">Approve</button>
                     <button className="flex-1 bg-slate-700 text-white font-black py-4 rounded-2xl">Reject</button>
                  </div>
               </div>
             ))}
          </div>
        )}
      </div>
    );
  };

  // --- Main Logic ---

  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center border border-indigo-50 max-w-sm w-full">
           <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
           <p className="text-indigo-950 font-black text-2xl tracking-tighter animate-pulse text-center leading-none">CONNECTING...</p>
           <p className="text-slate-400 text-[10px] mt-4 font-bold uppercase tracking-widest italic opacity-50">Powered by Firebase</p>
        </div>
      </div>
    );
  }

  if (currentView === 'student') return <StudentDashboard />;
  if (currentView === 'buy_pass') return <BuyPassView />;
  if (currentView === 'admin') return <AdminView />;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl p-10 flex flex-col items-center border border-white relative overflow-hidden">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
          <Ticket size={40} strokeWidth={2.5}/>
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-1 tracking-tighter italic">MFU Pass</h1>
        <p className="text-slate-300 mb-10 text-center font-bold text-[10px] uppercase tracking-[0.4em]">MVP ONLINE v1.9</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2.5rem] mb-8 flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 text-red-600 font-black"><ShieldAlert size={24}/><p className="text-lg tracking-tight">System Halted</p></div>
            <p className="text-[11px] font-bold text-red-900/60 bg-white/50 p-4 rounded-2xl border border-red-50 leading-relaxed italic">{errorMessage}</p>
            <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] font-black text-red-400 underline uppercase mx-auto">{showDebug ? 'Hide Diagnostics' : 'Show Diagnostics'}</button>
            {showDebug && (
              <div className="mt-2 text-[9px] bg-slate-900 text-slate-300 p-6 rounded-[2rem] font-mono space-y-3 shadow-2xl border border-slate-700">
                <div className="border-b border-slate-800 pb-2 mb-2 flex items-center gap-2 text-indigo-400"><Info size={12}/><span>Env Check:</span></div>
                {Object.entries(diagnostics).map(([k,v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-800/30 pb-1 italic text-[8px] uppercase tracking-tighter"><span className="opacity-40">{k.replace('NEXT_PUBLIC_FIREBASE_','').toLowerCase()}:</span><span>{v}</span></div>
                ))}
                <div className="pt-4 space-y-2">
                   <p className="text-amber-400 font-bold flex items-center gap-2"><Key size={10}/> Manual Override:</p>
                   <input type="text" placeholder="Paste API Key here" value={manualKey} onChange={(e) => setManualKey(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 text-[10px]"/>
                   <button onClick={() => startFirebase(manualKey)} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px] hover:bg-indigo-500 transition-all">Re-init System</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none grayscale blur-[1px]' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 transition-all group active:scale-95 shadow-sm hover:shadow-2xl">
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28}/></div>
            <div className="text-left font-black text-slate-800 group-hover:text-indigo-600 text-xl tracking-tighter">Student</div>
          </button>
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 transition-all group active:scale-95 shadow-sm hover:shadow-2xl">
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28}/></div>
            <div className="text-left font-black text-slate-800 group-hover:text-slate-900 text-xl tracking-tighter">Admin</div>
          </button>
        </div>
        <div className="mt-12 flex flex-col items-center gap-3">
           <div className="w-10 h-1 bg-slate-100 rounded-full"></div>
           <p className="text-[9px] text-slate-200 uppercase tracking-[0.6em] font-black">MFU Welcome Back MVP</p>
        </div>
      </div>
    </div>
  );
}