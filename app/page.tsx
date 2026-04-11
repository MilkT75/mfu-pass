"use client";
import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight,
  Upload, CheckCircle, XCircle, ExternalLink, RefreshCw, Key
} from "lucide-react";
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc, Firestore } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 1.8 (Manual Key Override + Wallet UI)
 */

const clean = (val: any) => {
  if (typeof val !== 'string') return "";
  return val.replace(/['" \t\n\r]+/g, '').trim();
};

const getInitialConfig = () => ({
  apiKey: clean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: clean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
});

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'buy_pass' | 'merchant' | 'admin'>('login');
  const [showDebug, setShowDebug] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [manualKey, setManualKey] = useState("");
  
  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);

  // ฟังก์ชันเริ่มต้น Firebase (รองรับการใส่ Key ด้วยตนเองเพื่อทดสอบ)
  const initFirebase = async (overrideConfig?: any) => {
    setIsProcessing(true);
    setErrorMessage(null);
    const config = overrideConfig || getInitialConfig();

    try {
      // ลบ Instance เดิมถ้ามี (กรณีใส่ Key ใหม่)
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      const auth = getAuth(app);
      const db = getFirestore(app);

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUserUid(currentUser.uid);
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists() && userSnap.data().role) {
            setCurrentView(userSnap.data().role);
          }
          setIsProcessing(false);
        } else {
          signInAnonymously(auth).catch((err) => {
            setErrorMessage(`Auth Error: ${err.message}`);
            setIsProcessing(false);
          });
        }
      });
      return unsubscribe;
    } catch (err: any) {
      setErrorMessage(`Init Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const config = getInitialConfig();
    const diagData = Object.keys(config).reduce((acc: any, key: string) => {
      const val = (config as any)[key];
      acc[key] = val ? `✅ [${val.substring(0, 4)}...${val.substring(val.length - 4)}]` : "❌ ว่างเปล่า";
      return acc;
    }, {});
    setDiagnostics(diagData);

    const unsub = initFirebase();
    return () => { unsub && typeof unsub === 'function' && unsub(); };
  }, []);

  // Listeners สำหรับข้อมูล
  useEffect(() => {
    if (!userUid) return;
    const db = getFirestore();

    if (currentView === 'student' || currentView === 'buy_pass') {
      const unsubPass = onSnapshot(doc(db, 'passes', userUid), (snap) => {
        if (snap.exists()) setActivePass(snap.data());
      });
      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      const unsubPurchases = onSnapshot(q, (snap) => {
        if (!snap.empty) setPendingPurchase({ id: snap.docs[0].id, ...snap.docs[0].data() });
        else setPendingPurchase(null);
      });
      return () => { unsubPass(); unsubPurchases(); };
    }

    if (currentView === 'admin') {
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      const unsubAdmin = onSnapshot(q, (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => unsubAdmin();
    }
  }, [userUid, currentView]);

  const handleManualOverride = () => {
    if (!manualKey.trim()) return;
    const newConfig = { ...getInitialConfig(), apiKey: manualKey.trim() };
    initFirebase(newConfig);
  };

  const handleRoleSelection = async (role: any) => {
    if (!userUid) return;
    setIsProcessing(true);
    try {
      await setDoc(doc(getFirestore(), 'users', userUid), { role }, { merge: true });
      setCurrentView(role);
    } catch (e) { alert(e); }
    setIsProcessing(false);
  };

  // --- UI Views ---

  const StudentView = () => (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <div className="bg-indigo-600 text-white px-8 pt-12 pb-20 rounded-b-[4rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10"><Ticket size={180} className="rotate-12" /></div>
        <div className="relative z-10 flex justify-between items-start mb-8">
          <div>
            <h2 className="text-4xl font-black tracking-tighter mb-1">MFU Pass</h2>
            <p className="text-indigo-200 font-bold uppercase tracking-widest text-[10px]">Student Dashboard</p>
          </div>
          <button onClick={() => setCurrentView('login')} className="bg-white/20 p-3 rounded-2xl backdrop-blur-md"><Settings2 size={20} /></button>
        </div>
      </div>

      <div className="px-6 -mt-12 space-y-6 relative z-20">
        {activePass ? (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50">
            <div className="flex justify-between items-center mb-6">
               <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Wallet size={24} /></div>
               <span className="bg-green-100 text-green-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Active Now</span>
            </div>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">คูปองที่ใช้ได้</p>
            <div className="flex items-baseline gap-2 mb-8">
              <span className="text-7xl font-black text-slate-900">{activePass.remainingCoupons}</span>
              <span className="text-2xl text-slate-300 font-bold">/ 5</span>
            </div>
            <button className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 active:scale-95 transition-all">
              <QrCode size={24} /> แสดงคิวอาร์เพื่อจ่าย
            </button>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-[2.5rem] p-10 border-4 border-dashed border-amber-100 text-center shadow-2xl animate-pulse">
            <Loader2 className="w-16 h-16 text-amber-500 animate-spin mx-auto mb-6" />
            <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">กำลังตรวจสอบสลิป</h3>
            <p className="text-slate-400 text-sm font-medium">แอดมินกำลังตรวจสอบความถูกต้องของยอดเงิน</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 text-center shadow-2xl">
            <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6"><Ticket size={48} /></div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">ยังไม่มีพาสส่วนลด</h3>
            <p className="text-slate-400 mb-8 text-sm font-medium px-4 leading-relaxed">ซื้อพาส Welcome Back 79 บาท เพื่อรับคูปอง 5 ใบ (มูลค่า 100 บาท)</p>
            <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all">
              ซื้อเลยวันนี้ <ArrowRight className="inline-block ml-1" size={18} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
           <div className="bg-slate-50 p-6 rounded-3xl flex flex-col items-center gap-2 grayscale opacity-50"><History size={20} /><p className="text-[10px] font-black uppercase">ประวัติย้อนหลัง</p></div>
           <div className="bg-slate-50 p-6 rounded-3xl flex flex-col items-center gap-2 grayscale opacity-50"><ExternalLink size={20} /><p className="text-[10px] font-black uppercase">วิธีใช้คูปอง</p></div>
        </div>
      </div>
    </div>
  );

  const BuyPassView = () => {
    const [isUploading, setIsUploading] = useState(false);
    const [slipBase64, setSlipBase64] = useState<string | null>(null);

    const handleFile = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setSlipBase64(reader.result as string);
        reader.readAsDataURL(file);
      }
    };

    const handleConfirm = async () => {
      if (!slipBase64 || !userUid) return;
      setIsUploading(true);
      try {
        await addDoc(collection(getFirestore(), 'purchases'), {
          studentUid: userUid,
          slipUrl: slipBase64,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        setCurrentView('student');
      } catch (e) { alert(e); }
      setIsUploading(false);
    };

    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col font-sans">
        <h2 className="text-3xl font-black mb-8 tracking-tighter">ซื้อพาสใหม่</h2>
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl mb-6 text-center border-2 border-indigo-50 flex flex-col items-center">
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">ยอดโอน: 79.00 บาท</p>
          <div className="w-full aspect-square bg-slate-100 rounded-3xl mb-4 flex items-center justify-center border-4 border-dashed border-slate-200">
            <QrCode size={64} className="text-slate-300" />
          </div>
          <p className="text-indigo-600 font-black text-sm uppercase">PromptPay MFU PASS</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 flex-1 flex flex-col">
          <p className="font-black text-slate-800 mb-4">แนบหลักฐานการโอน</p>
          <label className="flex-1 border-4 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative">
            {slipBase64 ? <img src={slipBase64} className="w-full h-full object-cover" alt="Preview" /> : (
              <><Upload className="text-slate-200 mb-2" size={40} /><span className="text-slate-300 text-xs font-bold uppercase">Tap to upload slip</span></>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>

        <div className="mt-8 space-y-3">
          <button disabled={!slipBase64 || isUploading} onClick={handleConfirm} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 disabled:bg-slate-200">
            {isUploading ? 'กำลังประมวลผล...' : 'ยืนยันและส่งสลิป'}
          </button>
          <button onClick={() => setCurrentView('student')} className="w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-xs">ยกเลิกรายการ</button>
        </div>
      </div>
    );
  };

  const AdminView = () => {
    const handleApprove = async (slip: any) => {
      try {
        const db = getFirestore();
        await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
        await setDoc(doc(db, 'passes', slip.studentUid), {
          studentUid: slip.studentUid,
          remainingCoupons: 5,
          totalCoupons: 5,
          updatedAt: new Date().toISOString()
        });
      } catch (e) { alert(e); }
    };

    return (
      <div className="min-h-screen bg-slate-900 p-6 flex flex-col font-sans text-white pb-20">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-black italic tracking-tighter">Admin Approval</h2>
          <button onClick={() => setCurrentView('login')} className="bg-white/10 p-3 rounded-full"><XCircle size={20} /></button>
        </div>
        {allPendingSlips.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20"><CheckCircle size={100} className="mb-4" /><p className="font-black tracking-[0.2em] uppercase">No pending slips</p></div>
        ) : (
          <div className="space-y-6">
            <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-center">— รอการอนุมัติ {allPendingSlips.length} รายการ —</p>
            {allPendingSlips.map(slip => (
              <div key={slip.id} className="bg-slate-800 rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl">
                <p className="text-[10px] font-mono text-slate-500 mb-6">UID: {slip.studentUid}</p>
                <div className="aspect-[3/4] bg-black rounded-3xl mb-8 overflow-hidden border border-slate-700 shadow-inner">
                  <img src={slip.slipUrl} className="w-full h-full object-contain" alt="Slip" />
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleApprove(slip)} className="flex-1 bg-green-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-900/40 active:scale-95 transition-all">Approve</button>
                  <button className="flex-1 bg-slate-700 text-white font-black py-4 rounded-2xl active:scale-95 transition-all">Reject</button>
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
        <p className="text-indigo-950 font-black text-2xl tracking-tighter animate-pulse">กำลังตรวจสอบระบบ...</p>
      </div>
    );
  }

  if (currentView === 'student') return <StudentView />;
  if (currentView === 'buy_pass') return <BuyPassView />;
  if (currentView === 'admin') return <AdminView />;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl p-10 flex flex-col items-center border border-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
          <Ticket size={40} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter italic">MFU Pass</h1>
        <p className="text-slate-400 mb-10 text-center font-bold text-[10px] uppercase tracking-[0.3em]">Welcome Back MVP Online</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2.5rem] mb-8 flex flex-col gap-4 animate-in fade-in zoom-in">
            <div className="flex items-center gap-3 text-red-600 font-black"><ShieldAlert size={24} /><p className="text-lg tracking-tight">ระบบขัดข้อง</p></div>
            <p className="text-[11px] font-bold text-red-900/70 bg-white/50 p-4 rounded-2xl border border-red-50 leading-relaxed italic">{errorMessage}</p>
            
            {/* โหมดวินิจฉัยและแก้ปัญหาด้วยตนเอง */}
            <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] font-black text-red-400 underline uppercase mx-auto">{showDebug ? 'ซ่อนการวินิจฉัย' : 'ดูวิธีการวินิจฉัย'}</button>
            {showDebug && diagnostics && (
              <div className="mt-2 text-[9px] bg-slate-900 text-slate-300 p-5 rounded-[2rem] font-mono space-y-3 shadow-2xl">
                <div className="border-b border-slate-800 pb-2 mb-2 flex items-center gap-2 text-indigo-400"><Info size={12}/><span>System Check:</span></div>
                {Object.entries(diagnostics).map(([k,v]: any) => (
                  <div key={k} className="flex justify-between border-b border-slate-800/50 pb-1 italic uppercase tracking-tighter"><span className="opacity-40">{k.replace('NEXT_PUBLIC_FIREBASE_','').toLowerCase()}:</span><span>{v}</span></div>
                ))}
                
                <div className="pt-4 space-y-2">
                   <p className="text-amber-400 font-bold flex items-center gap-2"><Key size={10}/> Manual API Key Override:</p>
                   <p className="text-[8px] opacity-50 font-sans leading-tight">หาก API Key ใน Vercel ไม่ทำงาน ให้วาง API Key จาก Firebase Console ตรงนี้เพื่อทดสอบครับ:</p>
                   <input 
                      type="text" 
                      placeholder="Paste AIza... here" 
                      value={manualKey} 
                      onChange={(e) => setManualKey(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                   />
                   <button onClick={handleManualOverride} className="w-full bg-indigo-600 text-white py-2 rounded-xl font-bold uppercase text-[10px] hover:bg-indigo-500 transition-colors">Test This Key</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 transition-all group active:scale-95 shadow-sm hover:shadow-xl">
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28} /></div>
            <div className="text-left font-black text-slate-800 group-hover:text-indigo-600 text-xl tracking-tighter">Student</div>
          </button>
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 transition-all group active:scale-95 shadow-sm hover:shadow-xl">
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28} /></div>
            <div className="text-left font-black text-slate-800 group-hover:text-slate-900 text-xl tracking-tighter">Admin</div>
          </button>
        </div>
        
        <p className="mt-12 text-[9px] text-slate-300 uppercase tracking-[0.5em] font-black">MFU v1.8 Diagnostic Build</p>
      </div>
    </div>
  );
}