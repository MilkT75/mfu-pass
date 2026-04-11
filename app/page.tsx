"use client";
import React, { useEffect, useState } from "react";
import { Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, Info } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * คำอธิบาย: ระบบ Login พร้อมตัวตรวจสอบสถานะ Environment Variables แบบละเอียด
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let auth: any;
let db: any;

try {
  // ตรวจสอบว่ามีค่า Config ครบก่อนเริ่มระบบ
  if (firebaseConfig.apiKey) {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'merchant' | 'admin'>('login');
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    // 1. ตรวจสอบว่าแอป "เห็น" ค่าจาก Vercel หรือไม่
    if (!firebaseConfig.apiKey) {
      setErrorMessage("แอปไม่พบค่า API Key: โปรดทำการ Redeploy บน Vercel เพื่ออัปเดตค่าล่าสุด");
      setIsProcessing(false);
      return;
    }

    if (!auth) {
      setErrorMessage("ไม่สามารถเริ่มต้นระบบ Auth ได้");
      setIsProcessing(false);
      return;
    }

    // 2. ตรวจสอบการล็อกอิน
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUserUid(currentUser.uid);
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists() && userSnap.data().role) {
            setCurrentView(userSnap.data().role as any);
          }
          setIsProcessing(false);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error: any) {
        console.error("Connection Error:", error);
        setErrorMessage(`เชื่อมต่อไม่สำเร็จ: ${error.message}`);
        setIsProcessing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleRoleSelection = async (role: 'student' | 'merchant' | 'admin') => {
    if (!userUid || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const userRef = doc(db, 'users', userUid);
      await setDoc(userRef, { uid: userUid, role: role, updatedAt: new Date().toISOString() }, { merge: true });
      setCurrentView(role);
      setIsProcessing(false);
    } catch (error: any) {
      setErrorMessage(`บันทึกข้อมูลไม่สำเร็จ: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // --- ส่วนหน้า Dashboard จำลอง ---
  if (currentView !== 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
          <ShieldCheck size={32} />
        </div>
        <h1 className="text-2xl font-black text-slate-800 mb-2 underline decoration-indigo-500 decoration-4">บทบาท: {currentView.toUpperCase()}</h1>
        <p className="text-slate-500 mb-8 font-medium">เชื่อมต่อฐานข้อมูลสำเร็จแล้ว! ระบบกำลังถูกพัฒนาต่อในส่วนนี้</p>
        <button onClick={() => setCurrentView('login')} className="text-sm font-bold text-indigo-600 hover:underline">← กลับไปหน้าเลือกบทบาท</button>
      </div>
    );
  }

  // --- หน้าจอรอโหลด ---
  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-indigo-900 font-bold animate-pulse">กำลังเรียกข้อมูลจาก Vercel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 flex flex-col items-center border border-white">
        <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200 transition-transform hover:scale-110">
          <Ticket size={32} />
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">MFU Pass</h1>
        <p className="text-slate-400 mb-8 text-sm font-medium">เข้าสู่ระบบเพื่อใช้งานคูปองส่วนลด</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-5 rounded-2xl mb-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red-600 font-bold">
              <AlertCircle size={20} />
              <p>ตรวจพบจุดที่ต้องแก้ไข</p>
            </div>
            <p className="text-xs text-red-700 font-medium leading-relaxed bg-white/50 p-2 rounded-lg border border-red-50">
              {errorMessage}
            </p>
            
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1 hover:text-red-600 transition-colors"
            >
              <Info size={12} /> {showDebug ? "ซ่อนรายละเอียด" : "ดูวิธีแก้ไข"}
            </button>

            {showDebug && (
              <div className="text-[10px] text-red-500 bg-red-100/30 p-3 rounded-xl space-y-2 border border-red-100 animate-in fade-in slide-in-from-top-1">
                <p className="font-bold underline text-red-600">ขั้นตอนแก้ไขให้หายขาด:</p>
                <p>1. ไปที่ <span className="font-bold italic">Vercel Dashboard</span></p>
                <p>2. ไปที่แถบ <span className="font-bold italic">Deployments</span></p>
                <p>3. กดปุ่ม <span className="font-bold italic">... (จุดสามจุด)</span> หลังรายการบนสุด</p>
                <p>4. เลือก <span className="font-bold bg-red-600 text-white px-1 rounded">Redeploy</span></p>
                <p className="mt-2 text-red-400 font-medium">*เนื่องจากเว็บตัวปัจจุบันยังจำค่าเก่า (ค่าว่าง) ไว้อยู่ จึงต้องสั่งสร้างใหม่ครับ*</p>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-20 pointer-events-none' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-50 hover:border-indigo-600 p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95 shadow-sm">
            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><User size={24} /></div>
            <div className="text-left"><h3 className="font-bold text-slate-700 group-hover:text-indigo-600">Student</h3><p className="text-[10px] text-slate-400">ซื้อและใช้คูปองส่วนลด</p></div>
          </button>
          <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white border-2 border-slate-50 hover:border-orange-500 p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95 shadow-sm">
            <div className="bg-orange-100 p-3 rounded-xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors"><Store size={24} /></div>
            <div className="text-left"><h3 className="font-bold text-slate-700 group-hover:text-orange-500">Merchant</h3><p className="text-[10px] text-slate-400">ร้านค้า - รับแสกนคูปอง</p></div>
          </button>
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95 shadow-sm">
            <div className="bg-slate-100 p-3 rounded-xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-colors"><ShieldCheck size={24} /></div>
            <div className="text-left"><h3 className="font-bold text-slate-700 group-hover:text-slate-900">Admin</h3><p className="text-[10px] text-slate-400">ผู้ดูแล - อนุมัติสลิปโอนเงิน</p></div>
          </button>
        </div>
        
        <p className="mt-10 text-[9px] text-slate-300 uppercase tracking-[0.3em] font-black">MFU Welcome Back v1.3</p>
      </div>
    </div>
  );
}