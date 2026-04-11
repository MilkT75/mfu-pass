"use client";
import React, { useEffect, useState } from "react";
import { Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, Info, ShieldAlert } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * คำอธิบาย: ระบบ Login พร้อมระบบ Auto-Clean Configuration เพื่อป้องกันปัญหา API Key ผิดพลาด
 */

// ฟังก์ชันสำหรับทำความสะอาดค่าจาก Environment Variables (ลบช่องว่างและเครื่องหมายคำพูด)
const cleanConfig = (key: string | undefined) => {
  if (!key) return "";
  return key.replace(/['"]+/g, '').trim();
};

const firebaseConfig = {
  apiKey: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanConfig(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
};

let auth: any;
let db: any;

try {
  // ตรวจสอบขั้นต่ำคือต้องมี API Key ก่อนเริ่มระบบ
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
    // 1. ตรวจสอบว่าแอป "เห็น" ค่าจาก Vercel หรือไม่ (หลังจาก Clean แล้ว)
    if (!firebaseConfig.apiKey) {
      setErrorMessage("แอปไม่พบค่า API Key ในระบบ: โปรดตรวจสอบการตั้งค่าใน Vercel และทำการ Redeploy");
      setIsProcessing(false);
      return;
    }

    if (!auth) {
      setErrorMessage("ไม่สามารถเริ่มต้นระบบ Firebase ได้ โปรดตรวจสอบความถูกต้องของ API Key");
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
        console.error("Detailed Auth Error:", error);
        
        // จัดการ Error เฉพาะทาง
        if (error.code === 'auth/api-key-not-valid') {
          setErrorMessage("API Key ไม่ถูกต้อง: โปรดตรวจสอบว่าไม่มีเว้นวรรคหรือเครื่องหมายคำพูดเกินมาใน Vercel Settings");
        } else if (error.code === 'auth/operation-not-allowed') {
          setErrorMessage("ยังไม่ได้เปิดใช้งาน 'Anonymous Sign-in' ใน Firebase Console");
        } else {
          setErrorMessage(`เชื่อมต่อไม่สำเร็จ: ${error.message}`);
        }
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
      await setDoc(userRef, { 
        uid: userUid, 
        role: role, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
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
        <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-200 animate-bounce">
          <ShieldCheck size={40} />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2 underline decoration-green-500 decoration-8 underline-offset-4">เข้าสู่ระบบสำเร็จ!</h1>
        <p className="text-slate-500 mb-8 font-bold text-lg">บทบาทปัจจุบันของคุณคือ: <span className="text-indigo-600">{currentView.toUpperCase()}</span></p>
        <button 
          onClick={() => setCurrentView('login')} 
          className="px-8 py-3 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-400 hover:text-indigo-600 hover:border-indigo-600 transition-all shadow-sm"
        >
          ← กลับไปหน้าเลือกบทบาท
        </button>
      </div>
    );
  }

  // --- หน้าจอรอโหลด (ปรับสีให้เข้มขึ้นเพื่อไม่ให้กลืน) ---
  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center border border-indigo-100">
          <div className="relative mb-6">
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin" />
            <Ticket className="w-6 h-6 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-indigo-950 font-black text-2xl tracking-tight">กำลังยืนยันตัวตน...</p>
          <p className="text-slate-400 text-sm mt-2 font-medium">โปรดรอสักครู่ ระบบกำลังติดต่อฐานข้อมูล</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans selection:bg-indigo-100">
      <div className="w-full max-w-md bg-white rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-10 flex flex-col items-center border border-white relative overflow-hidden">
        
        {/* ตกแต่งพื้นหลังเล็กน้อย */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-50 rounded-full blur-3xl opacity-50"></div>

        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-200 transition-transform hover:rotate-6">
          <Ticket size={40} strokeWidth={2.5} />
        </div>
        
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter">MFU Pass</h1>
        <p className="text-slate-400 mb-10 text-center font-bold text-sm uppercase tracking-[0.1em]">Welcome Back MVP</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-3xl mb-8 flex flex-col gap-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 text-red-600 font-black">
              <ShieldAlert size={24} />
              <p className="text-lg leading-none">พบข้อขัดข้องในการเชื่อมต่อ</p>
            </div>
            
            <div className="bg-white/80 p-4 rounded-2xl border border-red-100 shadow-inner">
              <p className="text-xs text-red-800 font-bold leading-relaxed">
                {errorMessage}
              </p>
            </div>
            
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-[11px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2 hover:text-red-700 transition-colors mx-auto"
            >
              <Info size={14} /> {showDebug ? "ซ่อนวิธีแก้ไข" : "ดูวิธีแก้ไขโดยละเอียด"}
            </button>

            {showDebug && (
              <div className="text-[11px] text-red-600/80 bg-red-100/30 p-4 rounded-2xl space-y-3 border border-red-100 leading-relaxed font-medium">
                <p className="font-black underline uppercase text-red-700">ลำดับขั้นตอนการแก้ปัญหา:</p>
                <p>1. เข้า <span className="font-bold">Vercel Dashboard</span> {'>'} <span className="font-bold underline text-red-800">Settings</span> {'>'} <span className="font-bold">Environment Variables</span></p>
                <p>2. ตรวจสอบว่าไม่มีเครื่องหมายคำพูด <span className="bg-red-200 px-1 rounded">" "</span> หรือช่องว่าง ครอบที่ค่า Value</p>
                <p>3. ไปที่แถบ <span className="font-bold">Deployments</span> กดที่ <span className="font-bold">... (จุดสามจุด)</span></p>
                <p>4. เลือก <span className="font-black bg-red-600 text-white px-2 py-0.5 rounded shadow-sm">Redeploy</span> (ห้ามติ๊ก Use Existing Build Cache)</p>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-30 grayscale pointer-events-none blur-[2px]' : ''}`}>
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-slate-100 hover:border-indigo-600 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm hover:shadow-xl hover:shadow-indigo-50">
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-inner"><User size={28} /></div>
            <div className="text-left leading-tight"><h3 className="font-black text-slate-800 group-hover:text-indigo-600 text-lg">Student</h3><p className="text-xs text-slate-400 font-bold">เข้าซื้อและใช้คูปอง</p></div>
          </button>
          
          <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white border-2 border-slate-100 hover:border-orange-500 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm hover:shadow-xl hover:shadow-orange-50">
            <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-all shadow-inner"><Store size={28} /></div>
            <div className="text-left leading-tight"><h3 className="font-black text-slate-800 group-hover:text-orange-500 text-lg">Merchant</h3><p className="text-xs text-slate-400 font-bold">ร้านค้า - แสกนรับคูปอง</p></div>
          </button>
          
          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-100 hover:border-slate-800 p-6 rounded-[1.5rem] flex items-center gap-5 transition-all group active:scale-95 shadow-sm hover:shadow-xl hover:shadow-slate-50">
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all shadow-inner"><ShieldCheck size={28} /></div>
            <div className="text-left leading-tight"><h3 className="font-black text-slate-800 group-hover:text-slate-900 text-lg">Admin</h3><p className="text-xs text-slate-400 font-bold">อนุมัติและจัดการระบบ</p></div>
          </button>
        </div>
        
        <div className="mt-12 flex flex-col items-center gap-2">
          <p className="text-[10px] text-slate-300 uppercase tracking-[0.4em] font-black">MFU Welcome Back v1.4</p>
          <div className="w-8 h-1 bg-slate-100 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}