"use client";
import React, { useEffect, useState } from "react";
import { Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, Info, ShieldAlert, Settings2 } from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 1.5 (Diagnostics Edition)
 */

// ฟังก์ชันล้างค่าตัวแปร
const clean = (val: any) => {
  if (typeof val !== 'string') return "";
  return val.replace(/['"]+/g, '').trim();
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
      
      // เก็บข้อมูล Diagnostic เพื่อดูว่าแอปมองเห็นค่าอะไรบ้าง (เซนเซอร์ค่าเพื่อความปลอดภัย)
      const diagData = Object.keys(config).reduce((acc: any, key: string) => {
        const val = (config as any)[key];
        acc[key] = val ? `✅ มีข้อมูล (${val.length} ตัวอักษร)` : "❌ ว่างเปล่า (Undefined)";
        return acc;
      }, {});
      setDiagnostics(diagData);

      if (!config.apiKey) {
        setErrorMessage("แอปมองเห็น API Key เป็นค่าว่าง: โปรดตรวจสอบว่าชื่อตัวแปรใน Vercel ตรงกับ NEXT_PUBLIC_FIREBASE_API_KEY หรือไม่");
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
      const config = getFirebaseConfig();
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

  if (currentView !== 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck size={60} className="text-green-500 mb-6 animate-pulse" />
        <h1 className="text-3xl font-black text-slate-900 mb-2">เข้าสู่ระบบสำเร็จ!</h1>
        <p className="text-slate-500 mb-8 font-bold">บทบาท: <span className="text-indigo-600 underline">{currentView.toUpperCase()}</span></p>
        <button onClick={() => setCurrentView('login')} className="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors">← กลับไปหน้าเลือกบทบาท</button>
      </div>
    );
  }

  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center border border-indigo-100 max-w-sm w-full">
          <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
          <p className="text-indigo-950 font-black text-2xl tracking-tight">กำลังตรวจสอบการเชื่อมต่อ</p>
          <p className="text-slate-400 text-sm mt-2 text-center">หากใช้เวลานานเกินไป โปรดตรวจเช็คค่า API Key ใน Vercel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 flex flex-col items-center border border-white relative overflow-hidden">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
          <Ticket size={40} />
        </div>
        
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter italic">MFU Pass</h1>
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
              <div className="mt-2 text-[10px] bg-slate-900 text-slate-300 p-4 rounded-2xl font-mono space-y-2 border border-slate-700 shadow-xl">
                <p className="text-indigo-400 font-bold border-b border-slate-700 pb-1 mb-2">Browser Env Check:</p>
                {Object.entries(diagnostics).map(([key, val]: any) => (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="opacity-50">{key.replace('NEXT_PUBLIC_FIREBASE_', '')}:</span>
                    <span className={val.includes('✅') ? 'text-green-400' : 'text-red-400'}>{val}</span>
                  </div>
                ))}
                <div className="pt-2 text-[9px] text-slate-500 italic border-t border-slate-700 mt-2">
                  * หากขึ้นเป็นสีแดง แสดงว่าค่าใน Vercel ส่งมาไม่ถึงโค้ดครับ *
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
        
        <p className="mt-12 text-[9px] text-slate-300 uppercase tracking-[0.4em] font-black">MFU v1.5 Diagnostic Build</p>
      </div>
    </div>
  );
}