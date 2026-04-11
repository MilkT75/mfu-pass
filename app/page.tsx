"use client";
import React, { useEffect, useState } from "react";
import { Ticket, User, Store, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// --- Firebase Configuration (Inlined for Preview Compatibility) ---
// ส่วนนี้คือการตั้งค่าเพื่อเชื่อมต่อกับ Firebase ของคุณ
const firebaseConfig = {
  apiKey: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_API_KEY : "",
  authDomain: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN : "",
  projectId: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_PROJECT_ID : "",
  storageBucket: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET : "",
  messagingSenderId: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID : "",
  appId: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_FIREBASE_APP_ID : ""
};

// เริ่มต้นใช้งาน Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'student' | 'merchant' | 'admin'>('login');

  // ตรวจสอบสถานะการเข้าสู่ระบบ
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUserUid(currentUser.uid);
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists() && userSnap.data().role) {
            // เปลี่ยนสถานะหน้าจอตามบทบาทที่บันทึกไว้
            setView(userSnap.data().role);
            setIsProcessing(false);
          } else {
            setIsProcessing(false);
          }
        } else {
          // หากยังไม่ล็อกอิน ให้ล็อกอินแบบไม่ระบุตัวตนอัตโนมัติ
          await signInAnonymously(auth);
        }
      } catch (error: any) {
        console.error("Firebase Error:", error);
        setErrorMessage("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ โปรดตรวจสอบตัวแปรสภาพแวดล้อม (Environment Variables)");
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
      await setDoc(userRef, { uid: userUid, role: role }, { merge: true });
      setView(role);
      setIsProcessing(false);
    } catch (error) {
      console.error("Error setting role:", error);
      setErrorMessage("เกิดข้อผิดพลาดในการบันทึกข้อมูลบทบาท");
      setIsProcessing(false);
    }
  };

  // ส่วนแสดงผลจำลองสำหรับแต่ละบทบาท (จะถูกแยกไฟล์ในภายหลัง)
  if (view === 'student') return (
    <div className="min-h-screen bg-indigo-50 flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-3xl font-bold text-indigo-900 mb-4">ยินดีต้อนรับ นักศึกษา</h2>
      <p className="text-indigo-600 mb-8">ขณะนี้คุณอยู่ในระบบด้วยบทบาท Student</p>
      <button onClick={() => setView('login')} className="text-indigo-500 underline font-medium">กลับหน้าเลือกบทบาท</button>
    </div>
  );
  
  if (view === 'merchant') return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-3xl font-bold text-orange-900 mb-4">ยินดีต้อนรับ ร้านค้า</h2>
      <p className="text-orange-600 mb-8">ขณะนี้คุณอยู่ในระบบด้วยบทบาท Merchant</p>
      <button onClick={() => setView('login')} className="text-orange-500 underline font-medium">กลับหน้าเลือกบทบาท</button>
    </div>
  );
  
  if (view === 'admin') return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-3xl font-bold text-slate-900 mb-4">ระบบจัดการ ผู้ดูแลระบบ</h2>
      <p className="text-slate-600 mb-8">ขณะนี้คุณอยู่ในระบบด้วยบทบาท Admin</p>
      <button onClick={() => setView('login')} className="text-slate-500 underline font-medium">กลับหน้าเลือกบทบาท</button>
    </div>
  );

  // หน้าจอระหว่างรอโหลดข้อมูล
  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center border border-indigo-50">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
          <p className="text-indigo-900 font-bold text-xl animate-pulse">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8 flex flex-col items-center border border-white/50">
        
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-200">
          <Ticket size={40} />
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">MFU Pass</h1>
        <p className="text-slate-500 mb-8 text-center font-medium">เลือกบทบาทของคุณเพื่อเข้าสู่ระบบ</p>

        {errorMessage && (
          <div className="w-full bg-red-50 border border-red-100 p-4 rounded-2xl mb-6 flex items-start gap-3 text-red-600">
            <AlertCircle className="shrink-0 w-5 h-5" />
            <p className="text-sm font-bold leading-tight">{errorMessage}</p>
          </div>
        )}

        <div className="w-full space-y-4">
          <button 
            onClick={() => handleRoleSelection('student')} 
            className="w-full bg-white border-2 border-indigo-50 hover:border-indigo-600 hover:shadow-lg p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95"
          >
            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <User size={24} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-indigo-600">Student</h3>
              <p className="text-xs text-slate-400 font-medium">นักศึกษา - ซื้อและใช้คูปอง</p>
            </div>
          </button>

          <button 
            onClick={() => handleRoleSelection('merchant')} 
            className="w-full bg-white border-2 border-orange-50 hover:border-orange-500 hover:shadow-lg p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95"
          >
            <div className="bg-orange-100 p-3 rounded-xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
              <Store size={24} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-orange-500">Merchant</h3>
              <p className="text-xs text-slate-400 font-medium">ร้านค้า - รับแสกนคูปอง</p>
            </div>
          </button>

          <button 
            onClick={() => handleRoleSelection('admin')} 
            className="w-full bg-white border-2 border-slate-50 hover:border-slate-800 hover:shadow-lg p-5 rounded-2xl flex items-center gap-4 transition-all group active:scale-95"
          >
            <div className="bg-slate-100 p-3 rounded-xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <ShieldCheck size={24} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-slate-900">Admin</h3>
              <p className="text-xs text-slate-400 font-medium">ผู้ดูแล - อนุมัติสลิปโอนเงิน</p>
            </div>
          </button>
        </div>

        <p className="mt-8 text-[10px] text-slate-300 uppercase tracking-[0.2em] font-bold">MFU Welcome Back MVP v1.1</p>
      </div>
    </div>
  );
}