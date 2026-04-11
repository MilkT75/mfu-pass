"use client";
import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  Info, ShieldAlert, Settings2, Wallet, QrCode, History, ArrowRight
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 1.6 (Student Dashboard Early Access + Enhanced Diagnostics)
 */

// ฟังก์ชันล้างค่าตัวแปร
const clean = (val: any) => {
  if (typeof val !== 'string') return "";
  // ลบช่องว่าง, เครื่องหมายคำพูดทุกชนิด และอักขระพิเศษที่อาจติดมา
  return val.replace(/['" \t\n\r]+/g, '').trim();
};

const getFirebaseConfig = () => ({
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
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'merchant' | 'admin'>('login');
  const [showDebug, setShowDebug] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  useEffect(() => {
    const runSetup = async () => {
      const config = getFirebaseConfig();
      
      // ข้อมูล Diagnostic แบบละเอียด (แสดงหัว-ท้ายเพื่อความปลอดภัย)
      const diagData = Object.keys(config).reduce((acc: any, key: string) => {
        const val = (config as any)[key];
        if (val) {
          const masked = `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
          acc[key] = `✅ [${masked}] (${val.length} ตัวอักษร)`;
        } else {
          acc[key] = "❌ ว่างเปล่า (Undefined)";
        }
        return acc;
      }, {});
      setDiagnostics(diagData);

      if (!config.apiKey) {
        setErrorMessage("แอปมองเห็น API Key เป็นค่าว่าง");
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
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && userSnap.data().role) {
              setCurrentView(userSnap.data().role as any);
            }
            setIsProcessing(false);
          } else {
            try {
              await signInAnonymously(auth);
            } catch (authErr: any) {
              setErrorMessage(`Firebase Auth Error: ${authErr.message}`);
              setIsProcessing(false);
            }
          }
        });

        return () => unsubscribe();
      } catch (initErr: any) {
        setErrorMessage(`Firebase Init Failed: ${initErr.message}`);
        setIsProcessing(false);
      }
    };

    runSetup();
  }, []);

  const handleRoleSelection = async (role: 'student' | 'merchant' | 'admin') => {
    if (!userUid || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const app = getApp();
      const db = getFirestore(app);
      const userRef = doc(db, 'users', userUid);
      await setDoc(userRef, { uid: userUid, role: role, updatedAt: new Date().toISOString() }, { merge: true });
      setCurrentView(role);
      setIsProcessing(false);
    } catch (error: any) {
      setErrorMessage(`บันทึกข้อมูลล้มเหลว: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // --- 1. หน้าจอนักศึกษา (Student View) ---
  const StudentDashboard = () => (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-20">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-8 rounded-b-[3rem] shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
            <Ticket size={24} />
          </div>
          <button onClick={() => setCurrentView('login')} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors">
            <Settings2 size={20} />
          </button>
        </div>
        <p className="text-indigo-100 text-sm font-medium mb-1">ยินดีต้อนรับนักศึกษา</p>
        <h2 className="text-3xl font-black tracking-tight">MFU Welcome Back</h2>
      </div>

      {/* Main Content */}
      <div className="p-6 -mt-10 space-y-6">
        {/* Wallet Card */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-indigo-100 border border-indigo-50 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <Wallet size={32} />
          </div>
          <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">คูปองคงเหลือ</h3>
          <p className="text-5xl font-black text-slate-900 mb-2">0 <span className="text-lg text-slate-300 font-medium">/ 5</span></p>
          <p className="text-slate-400 text-xs mb-6 italic">คุณยังไม่มีพาสสำหรับใช้งาน</p>
          
          <button className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95">
            ซื้อพาสใหม่ (79 บาท) <ArrowRight size={18} />
          </button>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center group">
            <div className="bg-orange-50 text-orange-500 p-4 rounded-2xl mb-3 group-hover:bg-orange-500 group-hover:text-white transition-all"><QrCode /></div>
            <p className="font-bold text-slate-800 text-sm">แสกนจ่าย</p>
          </div>
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center group">
            <div className="bg-blue-50 text-blue-500 p-4 rounded-2xl mb-3 group-hover:bg-blue-500 group-hover:text-white transition-all"><History /></div>
            <p className="font-bold text-slate-800 text-sm">ประวัติ</p>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-300 font-bold mt-auto mb-4 tracking-widest">UID: {userUid?.substring(0, 10)}...</p>
    </div>
  );

  // --- กรองการแสดงผลตาม View ---
  if (currentView === 'student') return <StudentDashboard />;
  if (currentView === 'merchant') return <div className="p-10 text-center font-bold">Merchant View (Coming Soon)</div>;
  if (currentView === 'admin') return <div className="p-10 text-center font-bold">Admin View (Coming Soon)</div>;

  // --- หน้าจอโหลดข้อมูล ---
  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-900 font-bold text-xl animate-pulse">กำลังตรวจสอบการเชื่อมต่อ...</p>
      </div>
    );
  }

  // --- หน้าจอ Login ---
  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 flex flex-col items-center border border-white relative overflow-hidden">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
          <Ticket size={40} />
        </div>
        
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter italic text-center">MFU Pass</h1>
        <p className="text-slate-400 mb-10 text-center font-bold text-sm uppercase tracking-[0.2em]">Deployment Online</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2rem] mb-8 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-600 font-black">
              <ShieldAlert size={24} />
              <p className="text-lg tracking-tight">การเชื่อมต่อผิดพลาด</p>
            </div>
            <div className="bg-white/60 p-4 rounded-xl border border-red-50 shadow-inner">
              <p className="text-[11px] text-red-900 font-bold leading-relaxed">{errorMessage}</p>
            </div>
            
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-2 text-[10px] font-black text-red-400 uppercase tracking-widest mx-auto hover:text-red-700 transition-colors"
            >
              <Settings2 size={14} /> {showDebug ? "ซ่อนข้อมูลวินิจฉัย" : "ดูข้อมูลวินิจฉัย (Diagnostics)"}
            </button>

            {showDebug && diagnostics && (
              <div className="mt-2 text-[10px] bg-slate-900 text-slate-300 p-4 rounded-2xl font-mono space-y-2 border border-slate-700 shadow-xl overflow-x-auto w-full">
                <p className="text-indigo-400 font-bold border-b border-slate-700 pb-1 mb-2">Browser Check ( masked ):</p>
                {Object.entries(diagnostics).map(([key, val]: any) => (
                  <div key={key} className="flex justify-between gap-4 whitespace-nowrap">
                    <span className="opacity-50 lowercase">{key.replace('NEXT_PUBLIC_FIREBASE_', '')}:</span>
                    <span className={val.includes('✅') ? 'text-green-400' : 'text-red-400'}>{val}</span>
                  </div>
                ))}
                <div className="pt-2 text-[9px] text-slate-500 italic border-t border-slate-700 mt-2 leading-relaxed">
                  * ตรวจสอบ 4 ตัวท้ายใน [ ... ] ว่าตรงกับใน Firebase Console หรือไม่
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none blur-[1px]' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-100 hover:border-indigo-600 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm">
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><User size={28} /></div>
            <div className="text-left font-black text-slate-800 group-hover:text-indigo-600 text-lg">Student</div>
          </button>
          <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white border-2 border-slate-100 hover:border-orange-500 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm">
            <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-all"><Store size={28} /></div>
            <div className="text-left font-black text-slate-800 group-hover:text-orange-500 text-lg">Merchant</div>
          </button>
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-100 hover:border-slate-800 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm">
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all"><ShieldCheck size={28} /></div>
            <div className="text-left font-black text-slate-800 group-hover:text-slate-900 text-lg">Admin</div>
          </button>
        </div>
        
        <p className="mt-12 text-[9px] text-slate-300 uppercase tracking-[0.4em] font-black">MFU v1.6 Student Alpha</p>
      </div>
    </div>
  );
}