"use client";
import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight,
  Upload, CheckCircle, XCircle, ExternalLink, RefreshCw
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 1.7 (Student Buy Pass + Admin Approval System)
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
  
  // Data States
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);

  // 1. Firebase Initialization & Auth
  useEffect(() => {
    const config = getInitialConfig();
    
    const diagData = Object.keys(config).reduce((acc: any, key: string) => {
      const val = (config as any)[key];
      acc[key] = val ? `✅ [${val.substring(0, 4)}...${val.substring(val.length - 4)}]` : "❌ ว่างเปล่า";
      return acc;
    }, {});
    setDiagnostics(diagData);

    if (!config.apiKey) {
      setErrorMessage("ไม่พบ API Key ใน Vercel");
      setIsProcessing(false);
      return;
    }

    try {
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      const auth = getAuth(app);
      const db = getFirestore(app);

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUserUid(currentUser.uid);
          // ดึงข้อมูลบทบาท
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

      return () => unsubscribe();
    } catch (err: any) {
      setErrorMessage(`Init Error: ${err.message}`);
      setIsProcessing(false);
    }
  }, []);

  // 2. Real-time Listeners (สำหรับข้อมูลในแต่ละหน้า)
  useEffect(() => {
    if (!userUid) return;
    const db = getFirestore();

    // สำหรับนักศึกษา: ติดตามสถานะพาสและรายการรออนุมัติ
    if (currentView === 'student' || currentView === 'buy_pass') {
      const unsubPass = onSnapshot(doc(db, 'passes', userUid), (snap) => {
        if (snap.exists()) setActivePass(snap.data());
      });
      // ค้นหาการซื้อที่ยังค้างอยู่
      const q = query(collection(db, 'purchases'), where('studentUid', '==', userUid), where('status', '==', 'pending'));
      const unsubPurchases = onSnapshot(q, (snap) => {
        if (!snap.empty) setPendingPurchase({ id: snap.docs[0].id, ...snap.docs[0].data() });
        else setPendingPurchase(null);
      });
      return () => { unsubPass(); unsubPurchases(); };
    }

    // สำหรับแอดมิน: ติดตามสลิปที่รออนุมัติทั้งหมด
    if (currentView === 'admin') {
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      const unsubAdmin = onSnapshot(q, (snap) => {
        setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => unsubAdmin();
    }
  }, [userUid, currentView]);

  const handleRoleSelection = async (role: any) => {
    if (!userUid) return;
    setIsProcessing(true);
    try {
      await setDoc(doc(getFirestore(), 'users', userUid), { role }, { merge: true });
      setCurrentView(role);
    } catch (e) { alert(e); }
    setIsProcessing(false);
  };

  // --- UI Components ---

  const StudentView = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="bg-indigo-600 text-white p-8 rounded-b-[3rem] shadow-lg mb-6">
        <h2 className="text-3xl font-black mb-1">MFU Pass</h2>
        <p className="opacity-80 text-sm">ยินดีต้อนรับนักศึกษา</p>
      </div>

      <div className="px-6 flex-1 space-y-6 pb-10">
        {activePass ? (
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
            <Ticket className="absolute top-0 right-0 opacity-10 -rotate-12" size={120} />
            <h3 className="text-xl font-bold mb-6">พาสใช้งานได้</h3>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-indigo-200 text-xs uppercase tracking-widest mb-1">คูปองคงเหลือ</p>
                <p className="text-6xl font-black">{activePass.remainingCoupons} <span className="text-xl opacity-40">/ 5</span></p>
              </div>
              <button className="bg-white text-indigo-600 p-4 rounded-2xl shadow-lg"><QrCode size={24} /></button>
            </div>
          </div>
        ) : pendingPurchase ? (
          <div className="bg-white rounded-3xl p-10 border-2 border-dashed border-amber-200 text-center shadow-xl">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-800 mb-2">กำลังรอแอดมินตรวจสอบ</h3>
            <p className="text-slate-500 text-sm leading-relaxed">เราได้รับสลิปโอนเงินของคุณแล้ว โปรดรอแอดมินอนุมัติพาสของคุณในไม่ช้า</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 text-center shadow-xl">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
              <Ticket size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">ยังไม่มีพาส</h3>
            <p className="text-slate-500 mb-8 text-sm">ซื้อพาส Welcome Back (5 คูปอง) เพื่อใช้เป็นส่วนลดที่โรงอาหาร</p>
            <button 
              onClick={() => setCurrentView('buy_pass')}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all"
            >
              ซื้อพาสใหม่ (79 บาท)
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col items-center shadow-sm">
            <History className="text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">ประวัติการใช้</p>
          </div>
          <button onClick={() => setCurrentView('login')} className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col items-center shadow-sm">
            <Settings2 className="text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">ตั้งค่า</p>
          </button>
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
        <h2 className="text-3xl font-black mb-6">ซื้อพาส</h2>
        
        <div className="bg-white rounded-3xl p-8 shadow-xl mb-6 text-center border-2 border-indigo-50">
          <p className="text-slate-500 font-bold mb-4">โอนเงิน 79 บาท ไปยัง PromptPay</p>
          <div className="bg-slate-100 aspect-square rounded-2xl mb-4 flex items-center justify-center border-2 border-dashed border-slate-300">
            <span className="text-slate-400 font-bold italic">[ รูป QR Code 79 บาท ]</span>
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">MFU PASS OFFICIAL ACCOUNT</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex-1">
          <p className="font-bold mb-4 text-slate-800">แนบสลิปการโอนเงิน</p>
          <label className="w-full aspect-video border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative">
            {slipBase64 ? (
              <img src={slipBase64} className="w-full h-full object-cover" alt="Preview" />
            ) : (
              <>
                <Upload className="text-slate-300 mb-2" />
                <span className="text-slate-400 text-xs font-bold">เลือกรูปสลิป</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>

        <div className="mt-8 space-y-3">
          <button 
            disabled={!slipBase64 || isUploading}
            onClick={handleConfirm}
            className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 disabled:bg-slate-300"
          >
            {isUploading ? 'กำลังส่งสลิป...' : 'ยืนยันการซื้อ'}
          </button>
          <button onClick={() => setCurrentView('student')} className="w-full py-4 text-slate-400 font-bold">ยกเลิก</button>
        </div>
      </div>
    );
  };

  const AdminView = () => {
    const handleApprove = async (slip: any) => {
      try {
        const db = getFirestore();
        // 1. อนุมัติสลิป
        await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
        // 2. สร้างพาสให้นักศึกษา
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
          <h2 className="text-3xl font-black">Admin Approval</h2>
          <button onClick={() => setCurrentView('login')} className="text-slate-500"><XCircle /></button>
        </div>

        {allPendingSlips.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30">
            <CheckCircle size={80} className="mb-4" />
            <p className="font-bold tracking-widest uppercase">ไม่มีสลิปที่รอตรวจสอบ</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em] mb-4">รอการอนุมัติ {allPendingSlips.length} รายการ</p>
            {allPendingSlips.map(slip => (
              <div key={slip.id} className="bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl">
                <p className="text-[10px] font-mono text-slate-500 mb-4">UID: {slip.studentUid}</p>
                <div className="aspect-[3/4] bg-black rounded-2xl mb-6 overflow-hidden border border-slate-700">
                  <img src={slip.slipUrl} className="w-full h-full object-contain" alt="Slip" />
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleApprove(slip)}
                    className="flex-1 bg-green-500 text-white font-black py-4 rounded-xl shadow-lg shadow-green-900/20 active:scale-95 transition-all"
                  >
                    Approve
                  </button>
                  <button className="flex-1 bg-slate-700 text-white font-black py-4 rounded-xl active:scale-95 transition-all">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- Main Logic & Fallback Screens ---

  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-900 font-bold text-xl animate-pulse tracking-tight">กำลังตรวจสอบข้อมูล...</p>
      </div>
    );
  }

  if (currentView === 'student') return <StudentView />;
  if (currentView === 'buy_pass') return <BuyPassView />;
  if (currentView === 'admin') return <AdminView />;

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 flex flex-col items-center border border-white relative">
        <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-100">
          <Ticket size={32} />
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 mb-1 italic">MFU Pass</h1>
        <p className="text-slate-400 mb-10 text-center font-bold text-xs uppercase tracking-widest">ยินดีต้อนรับกลับสู่ระบบ</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2rem] mb-8 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red-600 font-black"><ShieldAlert size={18} /><span>เชื่อมต่อขัดข้อง</span></div>
            <p className="text-[11px] font-bold text-red-900/70 bg-white/50 p-3 rounded-xl border border-red-50">{errorMessage}</p>
            <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] font-black text-red-400 underline uppercase mx-auto">{showDebug ? 'ซ่อนวินิจฉัย' : 'ดูวิธีวินิจฉัย'}</button>
            {showDebug && diagnostics && (
              <div className="mt-2 text-[9px] bg-slate-900 text-slate-300 p-4 rounded-2xl font-mono space-y-1">
                {Object.entries(diagnostics).map(([k,v]: any) => (
                  <div key={k} className="flex justify-between"><span>{k.replace('NEXT_PUBLIC_FIREBASE_','').toLowerCase()}:</span><span>{v}</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm">
            <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={24} /></div>
            <div className="text-left font-black text-slate-800 text-lg">Student</div>
          </button>
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm">
            <div className="bg-slate-50 p-3 rounded-xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={24} /></div>
            <div className="text-left font-black text-slate-800 text-lg">Admin</div>
          </button>
        </div>

        <p className="mt-12 text-[9px] text-slate-300 uppercase tracking-[0.4em] font-black">MFU v1.7 Stable MVP</p>
      </div>
    </div>
  );
}