"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, AlertCircle, 
  ShieldAlert, Settings2, QrCode, RefreshCw, 
  // Add other icons you use as needed
} from "lucide-react";

import { initializeApp, getApps, deleteApp, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, Unsubscribe, User as FirebaseUser } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, where, updateDoc, increment, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
};

let firebaseApp: any = null;
let dbInstance: Firestore | null = null;

const initFirebase = (customApiKey?: string): { app: any; auth: any; db: Firestore } => {
  const config = { ...firebaseConfig };
  if (customApiKey) config.apiKey = customApiKey.trim();

  // Clean up previous apps if we're forcing a new key
  if (customApiKey && getApps().length > 0) {
    getApps().forEach(app => deleteApp(app));
  }

  if (getApps().length === 0 || customApiKey) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApp();
  }

  const auth = getAuth(firebaseApp);
  dbInstance = getFirestore(firebaseApp);

  return { app: firebaseApp, auth, db: dbInstance };
};

export default function MFUPassApp() {
  const [userUid, setUserUid] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'student' | 'buy_pass' | 'merchant' | 'admin' | 'scan_qr' | 'success'>('login');
  const [showDebug, setShowDebug] = useState(false);
  const [manualKey, setManualKey] = useState("");

  // Data states
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [merchantRedemptions, setMerchantRedemptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const authUnsubscribe = useRef<Unsubscribe | null>(null);
  const listenersUnsubscribe = useRef<(() => void)[]>([]);

  const connectSystem = useCallback(async (customKey?: string) => {
    setIsProcessing(true);
    setErrorMessage(null);

    // Cleanup previous auth listener
    if (authUnsubscribe.current) {
      authUnsubscribe.current();
      authUnsubscribe.current = null;
    }

    try {
      const { auth, db } = initFirebase(customKey);

      authUnsubscribe.current = onAuthStateChanged(auth, async (currentUser: FirebaseUser | null) => {
        if (currentUser) {
          setUserUid(currentUser.uid);

          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          const role = userSnap.exists() ? userSnap.data()?.role : null;

          if (role && ['student', 'merchant', 'admin'].includes(role)) {
            setCurrentView(role as any);
          } else {
            setCurrentView('login'); // Force role selection if none set
          }
        } else {
          // Sign in anonymously
          try {
            await signInAnonymously(auth);
          } catch (err: any) {
            console.error("Anonymous sign-in error:", err);
            if (err.code?.includes('api-key-not-valid') || err.message?.includes('API key not valid')) {
              setErrorMessage("API Key ไม่ถูกต้องหรือถูกจำกัดสิทธิ์\n\nไปที่ Google Cloud Console → Credentials → Edit API Key → เลือก \"Don't restrict key\" แล้ว Save");
            } else {
              setErrorMessage(err.message || "เกิดข้อผิดพลาดในการล็อกอิน");
            }
          }
        }
        setIsProcessing(false);
      });
    } catch (err: any) {
      console.error("Init error:", err);
      setErrorMessage(err.message || "ไม่สามารถเริ่มต้น Firebase ได้");
      setIsProcessing(false);
    }
  }, []);

  // Initial connection
  useEffect(() => {
    connectSystem();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      if (authUnsubscribe.current) authUnsubscribe.current();
      clearInterval(timer);
      listenersUnsubscribe.current.forEach(unsub => unsub());
    };
  }, [connectSystem]);

  // Real-time listeners
  useEffect(() => {
    if (!userUid || isProcessing) return;

    const db = dbInstance || getFirestore();
    const unsubs: (() => void)[] = [];

    if (['student', 'buy_pass', 'scan_qr'].includes(currentView)) {
      unsubs.push(
        onSnapshot(doc(db, 'passes', userUid), (snap) => {
          setActivePass(snap.exists() ? snap.data() : null);
        })
      );

      const q = query(
        collection(db, 'purchases'),
        where('studentUid', '==', userUid),
        where('status', '==', 'pending')
      );
      unsubs.push(
        onSnapshot(q, (snap) => {
          setPendingPurchase(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
        })
      );
    }

    if (currentView === 'merchant') {
      const q = query(collection(db, 'redemptions'), where('merchantId', '==', userUid));
      unsubs.push(
        onSnapshot(q, (snap) => setMerchantRedemptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      );
    }

    if (currentView === 'admin') {
      const q = query(collection(db, 'purchases'), where('status', '==', 'pending'));
      unsubs.push(
        onSnapshot(q, (snap) => setAllPendingSlips(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      );
    }

    listenersUnsubscribe.current = unsubs;
    return () => unsubs.forEach(f => f());
  }, [userUid, currentView, isProcessing]);

  const setRole = async (role: 'student' | 'merchant' | 'admin') => {
    if (!userUid) return;
    setIsProcessing(true);
    try {
      const db = dbInstance || getFirestore();
      await setDoc(doc(db, 'users', userUid), { role }, { merge: true });
      setCurrentView(role);
    } catch (e: any) {
      setErrorMessage(e.message);
    }
    setIsProcessing(false);
  };

  // ==================== RENDERING ====================

  if (isProcessing && !errorMessage) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center">
          <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
          <p className="text-indigo-950 font-black text-2xl animate-pulse">กำลังเชื่อมต่อระบบ...</p>
          <p className="text-slate-400 text-sm mt-2">โปรดรอสักครู่</p>
        </div>
      </div>
    );
  }

  // Student View (you already had this – kept mostly the same)
  if (currentView === 'student') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <div className="bg-indigo-600 text-white p-10 rounded-b-[3.5rem] shadow-xl">
          <h2 className="text-3xl font-black italic mb-1">MFU Pass</h2>
          <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Student Portal</p>
        </div>

        <div className="p-6 -mt-8 space-y-6 flex-1">
          {activePass && (activePass.remainingCoupons ?? 0) > 0 ? (
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50">
              <p className="text-slate-400 font-bold text-[10px] uppercase mb-1">คูปองคงเหลือ</p>
              <h3 className="text-6xl font-black text-slate-900 mb-8">
                {activePass.remainingCoupons} <span className="text-lg text-slate-200">/ 5</span>
              </h3>
              <button
                onClick={() => setCurrentView('scan_qr')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95"
              >
                <QrCode size={24} /> แสกนเพื่อรับส่วนลด
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-xl">
              <Ticket size={48} className="mx-auto text-slate-200 mb-4" />
              <h3 className="text-xl font-bold mb-2 text-slate-800">ยังไม่มีพาส</h3>
              <button
                onClick={() => setCurrentView('buy_pass')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl mt-4 transition-all active:scale-95"
              >
                ซื้อพาสใหม่ (79 บาท)
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setCurrentView('login');
              setUserUid(null);
            }}
            className="w-full text-center text-slate-300 font-bold text-xs uppercase tracking-widest mt-10 hover:text-slate-400"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // TODO: Add other views (buy_pass, scan_qr, merchant, admin, success) similarly.
  // For now they fall back to the role selector below.

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[3.5rem] shadow-2xl p-10 flex flex-col items-center relative overflow-hidden">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-100">
          <Ticket size={40} />
        </div>

        <h1 className="text-3xl font-black italic mb-2 tracking-tighter">MFU Pass MVP</h1>
        <p className="text-slate-300 mb-10 text-center font-bold text-[10px] uppercase tracking-[0.4em]">
          ระบบจัดการคูปองโรงอาหาร v2.3
        </p>

        {errorMessage && (
          <div className="w-full bg-red-50 border-2 border-red-100 p-6 rounded-[2.5rem] mb-8">
            <div className="flex items-center gap-3 text-red-600 font-black mb-3">
              <ShieldAlert size={24} />
              <span>การเชื่อมต่อผิดพลาด</span>
            </div>
            <p className="text-sm text-red-950 whitespace-pre-line mb-6 font-medium">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => connectSystem()}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <RefreshCw size={18} /> ทดสอบการเชื่อมต่อใหม่
              </button>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-[10px] underline text-slate-400 font-bold uppercase tracking-widest mx-auto block"
              >
                {showDebug ? 'ซ่อน' : 'วิธีแก้ไข & ใส่ API Key เอง'}
              </button>
            </div>

            {showDebug && (
              <div className="mt-6 bg-slate-900 p-6 rounded-[2rem] text-slate-300 text-xs space-y-4">
                <div>
                  <p className="text-amber-400 font-bold mb-1">1. แก้ไขที่ Google Cloud Console</p>
                  <p className="opacity-75">เลือก API Key → Application restrictions: <span className="font-bold text-white">None</span><br />
                  API restrictions: <span className="font-bold text-white">Don't restrict key</span> → Save</p>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <p className="text-indigo-400 font-bold mb-2">2. ทดสอบด้วย Key ใหม่</p>
                  <input
                    type="text"
                    placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    className="w-full bg-slate-800 text-white p-3 rounded-xl text-xs outline-none border border-slate-700 focus:border-indigo-500"
                  />
                  <button
                    onClick={() => connectSystem(manualKey)}
                    className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Reconnect with this key
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`w-full space-y-4 ${errorMessage ? 'opacity-30 pointer-events-none' : ''}`}>
          <button
            onClick={() => setRole('student')}
            className="w-full bg-white border-2 border-slate-100 hover:border-indigo-600 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-[0.985] transition-all group"
          >
            <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <User size={28} />
            </div>
            <span className="font-black text-xl text-slate-700 group-hover:text-indigo-600">Student</span>
          </button>

          <button
            onClick={() => setRole('merchant')}
            className="w-full bg-white border-2 border-slate-100 hover:border-orange-500 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-[0.985] transition-all group"
          >
            <div className="bg-orange-50 p-4 rounded-2xl text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-all">
              <Store size={28} />
            </div>
            <span className="font-black text-xl text-slate-700 group-hover:text-orange-500">Merchant</span>
          </button>

          <button
            onClick={() => setRole('admin')}
            className="w-full bg-white border-2 border-slate-100 hover:border-slate-800 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm active:scale-[0.985] transition-all group"
          >
            <div className="bg-slate-50 p-4 rounded-2xl text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all">
              <ShieldCheck size={28} />
            </div>
            <span className="font-black text-xl text-slate-700 group-hover:text-slate-900">Admin</span>
          </button>
        </div>

        <p className="mt-12 text-[9px] text-slate-200 uppercase tracking-[0.6em] font-black">MFU Pass • Recovery Build</p>
      </div>
    </div>
  );
}