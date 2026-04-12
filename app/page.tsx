"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon,
  XCircle, ScanLine, Edit2, MapPin, AlertTriangle, MessageSquareWarning, 
  Download, FileText, Info, Trash2, ArrowDownLeft, ArrowUpRight, Receipt,
  ChevronRight, Building, CreditCard, Power, PowerOff
} from "lucide-react";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut, updateProfile, 
  GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail
} from "firebase/auth";

import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, 
  onSnapshot, updateDoc, increment, serverTimestamp, query, where, getDocs, deleteDoc
} from "firebase/firestore";

/* ==================== TYPES ==================== */
interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  role: 'student' | 'merchant' | 'admin' | 'guest';
  isApproved: boolean;
  isRejected?: boolean;
  storeName?: string;
  location?: string;
  category?: string;
  ownerName?: string;
  bankName?: string;
  bankAccount?: string;
  storeImage?: string;
  isPaused?: boolean;
}

interface PurchaseSlip {
  id: string;
  studentUid: string;
  merchantId: string;
  numSets: number;
  totalAmount: number;
  slipUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Pass {
  id: string;
  studentUid: string;
  merchantId: string;
  remainingCoupons: number;
}

interface Redemption {
  id: string;
  studentUid: string;
  merchantId: string;
  amount: number;
  couponsUsed: number;
  redeemedAt: string;
  payoutStatus: 'pending' | 'paid';
}

interface Payout {
  id: string;
  merchantId: string;
  amount: number;
  slipUrl: string;
  paidAt: string;
}

interface AppSettings {
  pricePerSet: number;
  promptPayQr: string | null;
}

interface ReportIssue {
  id: string;
  studentUid: string;
  email: string;
  issue: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

/* ==================== CONSTANTS ==================== */
const ADMIN_EMAIL = "admin@mfupass.com";

/* ==================== FIREBASE CONFIG ==================== */
const getFirebaseConfig = () => ({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
});

/* ==================== NOTIFICATION SYSTEM ==================== */
const sendMerchantNotification = (merchantId: string, message: string) => {
  console.log(`Mock Notification to Merchant [${merchantId}]:`, message);
};

/* ==================== IMAGE COMPRESSOR ==================== */
// ป้องกันปัญหาการอัปโหลดไฟล์ภาพขนาดใหญ่เกินลิมิต 1MB ของ Firestore
const compressImage = (file: File, callback: (base64: string) => void) => {
  const reader = new FileReader();
  reader.onload = (e: any) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

/* ==================== MAIN APP ==================== */
export default function MFUPassApp() {
  const [user, setUser] = useState<any>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_setup' | 'merchant_setup' | 'forgot_password'>('login');
  const [currentView, setCurrentView] = useState<string>('auth');

  const [userData, setUserData] = useState<UserData | null>(null);
  const [myPasses, setMyPasses] = useState<Pass[]>([]);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  
  const [myPurchases, setMyPurchases] = useState<PurchaseSlip[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<Redemption[]>([]);

  const [allPendingSlips, setAllPendingSlips] = useState<PurchaseSlip[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [allPasses, setAllPasses] = useState<Pass[]>([]);
  const [allRedemptions, setAllRedemptions] = useState<Redemption[]>([]);
  const [allPayouts, setAllPayouts] = useState<Payout[]>([]);
  
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [merchantPayouts, setMerchantPayouts] = useState<Payout[]>([]);
  const [systemSettings, setSystemSettings] = useState<AppSettings>({ pricePerSet: 79, promptPayQr: null });

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const config = getFirebaseConfig();
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.email === ADMIN_EMAIL) {
          const adminSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (adminSnap.exists()) setUserData(adminSnap.data() as UserData);
          setCurrentView('admin');
        } else {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (userSnap.exists()) {
            const data = userSnap.data() as UserData;
            setUserData(data);
            setCurrentView(data.role);
          } else {
            setAuthMode('role_setup');
            setCurrentView('auth');
          }
        }
      } else {
        setCurrentView('auth');
        setAuthMode('login');
        setUserData(null);
      }
      setIsAppReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data() as AppSettings);
    }));

    if (['student', 'guest'].includes(currentView) || currentView === 'buy_pass' || currentView === 'scan_qr') {
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        const passes = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({id: d.id, ...d.data()} as Pass));
        setMyPasses(passes);
      }));

      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        const purchases = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip));
        setMyPurchases(purchases);
        const pending = purchases.find((p: PurchaseSlip) => p.status === 'pending');
        setPendingPurchase(pending || null);
      }));

      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        const reds = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        setMyRedemptions(reds);
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserData)));
      }));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        filtered.sort((a: Redemption, b: Redemption) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());
        setRedemptions(filtered);
      }));

      unsubs.push(onSnapshot(collection(db, 'payouts'), (snap) => {
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Payout));
        filtered.sort((a: Payout, b: Payout) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
        setMerchantPayouts(filtered);
      }));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap) => {
        setAllPendingSlips(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));
      unsubs.push(onSnapshot(collection(db, 'users'), (snap) => {
        setAllUsers(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserData)));
      }));
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap) => {
        setAllPasses(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Pass)));
      }));
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap) => {
        setAllRedemptions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Redemption)));
      }));
      unsubs.push(onSnapshot(collection(db, 'payouts'), (snap) => {
        setAllPayouts(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Payout)));
      }));
    }

    unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserData);
    }));

    return () => unsubs.forEach(unsub => unsub());
  }, [user, currentView]);

  const handleAuthAction = async (email: string, pass: string, displayName?: string) => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      if (authMode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        if (displayName) await updateProfile(userCred.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e: any) {
      let msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      if (e.code === 'auth/email-already-in-use') msg = "อีเมลนี้มีผู้ใช้งานแล้ว";
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') msg = "ไม่พบบัญชีผู้ใช้ หรือรหัสผ่านผิด";
      showToast(msg, "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsActionLoading(true);
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      // โชว์ Error เต็มๆ เพื่อให้รู้ว่าติดปัญหาเรื่อง Domain หรือเปล่า
      showToast(e.message || "เกิดข้อผิดพลาดในการล็อกอินด้วย Google", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForgotPassword = async (email: string) => {
    if(!email) return showToast("กรุณากรอกอีเมลก่อน", "error");
    try {
      await sendPasswordResetEmail(getAuth(), email);
      showToast("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว", "success");
      setAuthMode('login');
    } catch (e) {
      showToast("ไม่พบอีเมลนี้ในระบบ", "error");
    }
  };

  const handleLogout = () => {
    signOut(getAuth());
    setAuthMode('login');
  };

  const handleRoleSelect = async (role: string, extraData: any = {}) => {
    if (!user) {
       showToast("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่", "error");
       return;
    }

    if (role === 'student' && !user.email?.endsWith('@lamduan.mfu.ac.th')) {
      showToast("เฉพาะอีเมล @lamduan.mfu.ac.th สำหรับนักศึกษาเท่านั้น", "error");
      return;
    }

    setIsActionLoading(true);
    try {
      const db = getFirestore();
      const data = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        role,
        isApproved: role !== 'merchant',
        createdAt: serverTimestamp(),
        ...extraData
      };
      await setDoc(doc(db, 'users', user.uid), data, { merge: true });
      setCurrentView(role);
    } catch (error: any) {
      showToast(error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditName = async () => {
    const newName = prompt("ตั้งชื่อผู้ใช้งาน (Display Name) ใหม่:", userData?.displayName || "");
    if (newName && newName.trim() !== "") {
      const db = getFirestore();
      await updateDoc(doc(db, 'users', user.uid), { displayName: newName.trim() });
      showToast("อัปเดตชื่อผู้ใช้งานสำเร็จ", "success");
    }
  };

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center">
        <Ticket className="w-12 h-12 animate-pulse text-indigo-600 mb-4" />
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="relative bg-[#F9FAFB] min-h-screen font-sans text-slate-800">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-6 fade-in w-max max-w-[90%]">
          <div className={`px-5 py-3 rounded-full font-bold text-white shadow-lg flex items-center justify-center gap-2 text-sm
            ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'info' ? 'bg-blue-500' : 'bg-slate-900'}`}>
            {toast.type === 'error' && <XCircle size={16} className="shrink-0" />}
            {toast.type === 'success' && <CheckCircle size={16} className="shrink-0" />}
            {toast.type === 'info' && <Info size={16} className="shrink-0" />}
            <span className="truncate">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto bg-[#F9FAFB] min-h-screen shadow-[0_0_40px_rgba(0,0,0,0.05)] relative overflow-x-hidden border-x border-slate-100">
        {currentView === 'auth' && <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} showToast={showToast} onGoogleAuth={handleGoogleAuth} onForgotPassword={handleForgotPassword} onLogout={handleLogout} user={user} />}
        
        {currentView === 'admin' && <AdminDashboardView 
          allPendingSlips={allPendingSlips} 
          allUsers={allUsers} 
          allPasses={allPasses}
          allRedemptions={allRedemptions}
          allPayouts={allPayouts}
          systemSettings={systemSettings} 
          onLogout={handleLogout} 
          showToast={showToast} 
          user={user} 
          userData={userData} 
          onEditName={handleEditName} 
          setIsActionLoading={setIsActionLoading}
          isActionLoading={isActionLoading}
        />}
        
        {(currentView === 'student' || currentView === 'guest') && <StudentDashboardView user={user} userData={userData} myPasses={myPasses} allUsers={allUsers} pendingPurchase={pendingPurchase} myPurchases={myPurchases} myRedemptions={myRedemptions} onLogout={handleLogout} onBuyPass={() => setCurrentView('buy_pass')} onScan={() => setCurrentView('scan_qr')} showToast={showToast} onEditName={handleEditName} />}
        
        {currentView === 'merchant' && <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} merchantPayouts={merchantPayouts} onLogout={handleLogout} showToast={showToast} onEditName={handleEditName} />}
        
        {currentView === 'buy_pass' && <BuyPassView settings={systemSettings} allUsers={allUsers} onBack={() => setCurrentView(userData?.role || 'student')} user={user} showToast={showToast} />}
        
        {currentView === 'scan_qr' && <ScanQRView onBack={() => setCurrentView(userData?.role || 'student')} myPasses={myPasses} myRedemptions={myRedemptions} allUsers={allUsers} user={user} onSuccess={() => setCurrentView('success')} showToast={showToast} />}
        
        {currentView === 'success' && <SuccessView onDone={() => setCurrentView(userData?.role || 'student')} />}
      </div>
    </div>
  );
}

/* ==================== SUB COMPONENTS ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user, userData, showToast, onEditName }: any) {
  const bgColors: Record<string, string> = { indigo: "bg-indigo-600", orange: "bg-orange-500", slate: "bg-slate-900" };
  const bgClass = bgColors[color] || bgColors.indigo;

  return (
    <div className={`${bgClass} text-white px-6 py-10 rounded-b-[3rem] shadow-lg relative overflow-hidden w-full transition-all duration-500`}>
      <div className="absolute -right-8 -top-8 opacity-10 rotate-12 pointer-events-none"><Ticket size={180} /></div>
      <div className="flex justify-between items-start relative z-10">
        <div className="w-full pr-4 animate-in slide-in-from-left duration-500">
          <h2 className="text-4xl font-black italic tracking-tighter truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-white/80 text-xs font-bold uppercase tracking-widest truncate max-w-[200px]">{userData?.displayName || subtitle}</p>
            {onEditName && <button onClick={onEditName} className="text-white/60 hover:text-white transition-colors bg-white/10 p-1.5 rounded-lg active:scale-90"><Edit2 size={12} /></button>}
          </div>
        </div>
        {onLogout && <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-3 py-3 rounded-2xl transition-all active:scale-95 shrink-0 shadow-sm border border-white/10"><LogOut size={20} /></button>}
      </div>
      {user && (
        <div className="mt-8 bg-black/20 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-xs relative z-10 border border-white/10">
          <div className="font-mono truncate max-w-[180px] text-white/90">{user.uid}</div>
          <button onClick={() => { navigator.clipboard.writeText(user.uid); showToast("Copied", "success"); }} className="text-white hover:text-white flex items-center gap-1 text-[10px] font-bold px-3 py-2 bg-white/10 rounded-lg active:scale-95 shrink-0"><Copy size={14} /> COPY</button>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`bg-white rounded-3xl shadow-[0_5px_20px_rgba(0,0,0,0.03)] p-6 md:p-8 border border-slate-100 ${className}`}>{children}</div>;
}

/* ==================== AUTH SCREEN ==================== */
function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading, showToast, onGoogleAuth, onForgotPassword, onLogout, user }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Merchant Setup Form
  const [mStoreName, setMStoreName] = useState("");
  const [mLocation, setMLocation] = useState("");
  const [mCategory, setMCategory] = useState("Food");
  const [mOwnerName, setMOwnerName] = useState("");
  const [mBankName, setMBankName] = useState("");
  const [mBankAccount, setMBankAccount] = useState("");
  const [mStoreImage, setMStoreImage] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || !email.includes(".")) return showToast("รูปแบบอีเมลไม่ถูกต้อง", "error");
    if (password.length < 6) return showToast("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "error");
    if (authMode === 'register' && !displayName.trim()) return showToast("กรุณากรอกชื่อผู้ใช้งาน", "error");
    onAuth(email, password, displayName);
  };

  const handleMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mStoreName || !mLocation || !mOwnerName || !mBankName || !mBankAccount || !mStoreImage) return showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
    if (!acceptedPolicy) return showToast("กรุณายอมรับเงื่อนไข", "error");
    onRoleSelect('merchant', { 
      storeName: mStoreName, location: mLocation, category: mCategory, 
      ownerName: mOwnerName, bankName: mBankName, bankAccount: mBankAccount, storeImage: mStoreImage 
    });
  };

  if (authMode === 'forgot_password') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <div className="w-full max-w-sm animate-in fade-in duration-500">
           <h2 className="text-3xl font-black mb-2 text-slate-900">รีเซ็ตรหัสผ่าน</h2>
           <p className="text-sm text-slate-500 mb-8">ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณ</p>
           <input type="email" placeholder="กรอกอีเมลของคุณ" value={email} onChange={(e: any) => setEmail(e.target.value)} className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium mb-4"/>
           <button onClick={() => onForgotPassword(email)} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl active:scale-95 mb-4">ส่งลิงก์รีเซ็ต</button>
           <button onClick={() => setAuthMode('login')} className="w-full text-slate-500 font-bold py-4 text-sm">กลับไปหน้าล็อกอิน</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm animate-in fade-in duration-700">
        
        {authMode !== 'merchant_setup' && (
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-200 mb-6 rotate-3">
              <Ticket size={40} className="text-white" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          </div>
        )}

        {authMode === 'role_setup' ? (
          <div className="space-y-4 animate-in slide-in-from-bottom-4">
            <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest mb-6">เลือกบทบาทของคุณ</p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า (Partner)" onClick={() => setAuthMode('merchant_setup')} color="orange" />
            
            {/* Feature 4 Fix: ย้อนกลับไปหน้าเข้าสู่ระบบ */}
            <div className="text-center mt-6 pt-4 border-t border-slate-100">
              <button onClick={onLogout} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors py-2 px-4">
                ยกเลิก / กลับไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          </div>
        ) : authMode === 'merchant_setup' ? (
          <form onSubmit={handleMerchantSubmit} className="space-y-4 animate-in slide-in-from-right-4 max-h-[85vh] overflow-y-auto pb-10 px-2 scrollbar-hide">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-black text-slate-800">ข้อมูลร้านค้าพาร์ทเนอร์</h2>
            </div>

            <div className="space-y-3">
              <input type="text" placeholder="ชื่อร้านค้า" value={mStoreName} onChange={(e: any) => setMStoreName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium" required />
              <input type="text" placeholder="โซนที่ตั้งโรงอาหาร" value={mLocation} onChange={(e: any) => setMLocation(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium" required />
              <select value={mCategory} onChange={(e: any) => setMCategory(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium bg-white">
                <option value="Food">อาหาร</option>
                <option value="Beverage">เครื่องดื่ม</option>
                <option value="Snack">ของทานเล่น</option>
              </select>
              <input type="text" placeholder="ชื่อ-นามสกุล เจ้าของร้าน" value={mOwnerName} onChange={(e: any) => setMOwnerName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium" required />
              <input type="text" placeholder="ธนาคารที่ใช้รับเงิน" value={mBankName} onChange={(e: any) => setMBankName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium" required />
              <input type="text" placeholder="เลขที่บัญชี (ชื่อต้องตรงกับเจ้าของ)" value={mBankAccount} onChange={(e: any) => setMBankAccount(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-orange-500 outline-none text-sm font-medium" required />
            </div>

            <label className="border-2 border-dashed border-orange-200 rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer hover:bg-orange-50 overflow-hidden relative mt-2 bg-white">
              {mStoreImage ? <img src={mStoreImage} className="w-full h-full object-cover" alt="store" /> : <div className="text-center"><ImageIcon className="text-orange-300 mx-auto mb-1"/><span className="text-xs font-bold text-orange-400">อัปโหลดรูปหน้าร้าน</span></div>}
              <input type="file" accept="image/*" className="hidden" onChange={(e: any)=>{
                const f = e.target.files?.[0];
                if(f) compressImage(f, setMStoreImage);
              }} />
            </label>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 mt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={acceptedPolicy} onChange={(e: any) => setAcceptedPolicy(e.target.checked)} className="mt-1" />
                <span className="text-[10px] text-orange-900 leading-tight">ข้าพเจ้ายินยอมให้หักค่าธรรมเนียม 9 บาท/รอบบิล, รับโอนเงินรายสัปดาห์, ยินยอมให้ส่วนลด 20 บาท/คูปอง และยอมรับเงื่อนไขทางกฎหมายหากพบการทุจริต</span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setAuthMode('role_setup')} className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-sm hover:bg-slate-200">ยกเลิก</button>
              <button type="submit" className="w-2/3 bg-orange-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 text-sm">ส่งคำขอเปิดร้าน</button>
            </div>
          </form>
        ) : (
          <>
            {/* Google Sign-In */}
            <button onClick={onGoogleAuth} className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm mb-6 active:scale-95">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="h-px bg-slate-200 flex-1"></div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Or</span>
              <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === 'register' && (
                <input type="text" placeholder="Display Name" value={displayName} onChange={(e: any) => setDisplayName(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
              )}

              <input type="email" placeholder="Email Address" value={email} onChange={(e: any) => setEmail(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
              
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Password (Min 6 chars)" value={password} onChange={(e: any) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
              </div>

              {authMode === 'login' && (
                <div className="text-right">
                  <button type="button" onClick={() => setAuthMode('forgot_password')} className="text-xs font-bold text-indigo-500 hover:underline">Forgot Password?</button>
                </div>
              )}

              <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl text-base active:scale-95 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70">
                {isActionLoading ? <Loader2 className="animate-spin" size={20} /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </button>

              <div className="text-center pt-4">
                <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-slate-500 text-sm font-medium hover:text-indigo-600">
                  {authMode === 'login' ? 'New here? Sign up' : 'Already have an account? Sign in'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white border border-slate-200 hover:border-indigo-500 p-4 rounded-2xl flex items-center gap-4 active:scale-95 transition-all group">
      <div className={`text-${color}-500 bg-${color}-50 p-3 rounded-xl`}>{icon}</div>
      <div className="font-bold text-slate-700">{title}</div>
      <ChevronRight size={18} className="ml-auto text-slate-300 group-hover:text-indigo-500" />
    </button>
  );
}

/* ==================== ADMIN DASHBOARD ==================== */
function AdminDashboardView({ allPendingSlips, allUsers, allPasses, allRedemptions, allPayouts, systemSettings, onLogout, showToast, user, userData, onEditName, setIsActionLoading, isActionLoading }: any) {
  const [adminTab, setAdminTab] = useState<'overview' | 'slips' | 'payouts' | 'users' | 'settings'>('overview');
  const db = getFirestore();

  const pendingSlips = allPendingSlips.filter((s: PurchaseSlip) => s.status === 'pending');
  const pendingMerchants = allUsers.filter((u: UserData) => u.role === 'merchant' && !u.isApproved && !u.isRejected);
  
  // Payout Logic
  const unpaidRedemptions = allRedemptions.filter((r: Redemption) => r.payoutStatus !== 'paid');
  const owedPerMerchant: Record<string, {amount: number, redemptions: string[], merchantData: UserData | undefined}> = {};
  unpaidRedemptions.forEach((r: Redemption) => {
    if(!owedPerMerchant[r.merchantId]) owedPerMerchant[r.merchantId] = { amount: 0, redemptions: [], merchantData: allUsers.find((u: UserData) => u.uid === r.merchantId) };
    owedPerMerchant[r.merchantId].amount += r.amount;
    owedPerMerchant[r.merchantId].redemptions.push(r.id);
  });

  const handleApproveSlip = async (slip: PurchaseSlip) => {
    try {
      const db = getFirestore();
      const passQuery = query(collection(db, 'passes'), where('studentUid', '==', slip.studentUid), where('merchantId', '==', slip.merchantId));
      const passDocs = await getDocs(passQuery);
      const addedCoupons = 5 * slip.numSets;

      if (!passDocs.empty) {
        await updateDoc(passDocs.docs[0].ref, { remainingCoupons: increment(addedCoupons) });
      } else {
        await addDoc(collection(db, 'passes'), { studentUid: slip.studentUid, merchantId: slip.merchantId, remainingCoupons: addedCoupons });
      }
      await updateDoc(doc(db, 'purchases', slip.id), { status: 'approved' });
      
      const mData = allUsers.find((u: UserData) => u.uid === slip.merchantId);
      sendMerchantNotification(slip.merchantId, `🎉 MFU Pass: มีการอนุมัติการซื้อพาสใหม่ ${slip.numSets} เซ็ต! (ร้าน: ${mData?.storeName})`);
      showToast(`อนุมัติสำเร็จ! ระบบแจ้งเตือนจำลองทำงานแล้ว`, "success");
    } catch(err) { showToast("Error", "error"); }
  };

  const [payoutSlip, setPayoutSlip] = useState("");
  const [payingMerchant, setPayingMerchant] = useState("");

  const executePayout = async (merchantId: string, data: any) => {
    if(!payoutSlip) return showToast("กรุณาแนบสลิปโอนเงินก่อน", "error");
    setIsActionLoading(true);
    try {
      await addDoc(collection(db, 'payouts'), {
        merchantId, amount: data.amount, slipUrl: payoutSlip, paidAt: new Date().toISOString()
      });
      const batchPromises = data.redemptions.map((rId: string) => updateDoc(doc(db, 'redemptions', rId), { payoutStatus: 'paid' }));
      await Promise.all(batchPromises);
      showToast("บันทึกการโอนเงินสำเร็จ", "success");
      setPayoutSlip(""); setPayingMerchant("");
    } catch(e) { showToast("Error", "error"); }
    setIsActionLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      <Header title="Admin Console" subtitle="System Control" onLogout={onLogout} user={user} userData={userData} onEditName={onEditName} color="slate" showToast={showToast} />
      
      <div className="px-6 pt-2 pb-2 flex gap-2 overflow-x-auto scrollbar-hide bg-slate-950 shrink-0">
        <TabButton active={adminTab==='overview'} onClick={()=>setAdminTab('overview')} label="Overview" dark />
        <TabButton active={adminTab==='slips'} onClick={()=>setAdminTab('slips')} label={`Slips (${pendingSlips.length})`} dark />
        <TabButton active={adminTab==='payouts'} onClick={()=>setAdminTab('payouts')} label={`Payouts (${Object.keys(owedPerMerchant).length})`} dark />
        <TabButton active={adminTab==='users'} onClick={()=>setAdminTab('users')} label="Users" dark />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {adminTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">รอยืนยันสลิป</p>
                <p className="text-3xl font-black text-amber-400">{pendingSlips.length}</p>
              </div>
              <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">รอจ่ายเงินร้านค้า</p>
                <p className="text-3xl font-black text-green-400">{Object.keys(owedPerMerchant).length}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-300 mb-4 text-sm uppercase tracking-widest">อนุมัติร้านค้าใหม่ ({pendingMerchants.length})</h3>
              {pendingMerchants.length === 0 ? <p className="text-xs text-slate-600">No pending merchants.</p> : pendingMerchants.map((m: UserData) => (
                <div key={m.uid} className="bg-slate-900 p-5 rounded-3xl mb-3 border border-slate-800">
                  <div className="flex gap-4 items-center mb-4">
                    <img src={m.storeImage} className="w-16 h-16 rounded-xl object-cover bg-black" alt="store" />
                    <div>
                      <p className="font-bold text-white text-lg">{m.storeName}</p>
                      <p className="text-[10px] text-slate-400">{m.category} • {m.location}</p>
                    </div>
                  </div>
                  <div className="bg-black/50 p-3 rounded-xl mb-4 text-xs text-slate-300 space-y-1">
                    <p>เจ้าของ: {m.ownerName}</p>
                    <p>ธนาคาร: {m.bankName} - {m.bankAccount}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isApproved: true })} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs">Approve</button>
                    <button onClick={() => updateDoc(doc(db, 'users', m.uid), { isRejected: true })} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold text-xs">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminTab === 'slips' && (
          <div className="space-y-4 animate-in fade-in">
            {pendingSlips.length === 0 ? <p className="text-slate-600 text-sm text-center py-10">No pending slips.</p> : pendingSlips.map((slip: PurchaseSlip) => {
               const mData = allUsers.find((u: UserData) => u.uid === slip.merchantId);
               return (
                <div key={slip.id} className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 shadow-xl">
                  <div className="flex justify-between items-center mb-4 bg-black/40 p-4 rounded-2xl">
                    <div>
                      <span className="font-bold text-indigo-400 block">{slip.numSets} เซ็ต ({slip.totalAmount}฿)</span>
                      <span className="text-[10px] text-slate-500">To: {mData?.storeName || slip.merchantId.slice(0,8)}</span>
                    </div>
                    <span className="font-mono text-slate-500 text-xs">{slip.studentUid.slice(0,8)}</span>
                  </div>
                  <img src={slip.slipUrl} className="w-full rounded-[2rem] mb-6 object-cover bg-black max-h-80" alt="slip" />
                  <div className="flex gap-3">
                    <button onClick={() => handleApproveSlip(slip)} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold text-sm active:scale-95 shadow-lg shadow-green-900/20">อนุมัติ</button>
                    <button onClick={() => { updateDoc(doc(db, 'purchases', slip.id), { status: 'rejected' }); showToast("Rejected", "info"); }} className="flex-1 bg-red-600/20 text-red-500 py-4 rounded-2xl font-bold text-sm active:scale-95">ปฏิเสธ</button>
                  </div>
                </div>
               )
            })}
          </div>
        )}

        {adminTab === 'payouts' && (
          <div className="space-y-4 animate-in fade-in">
            {Object.keys(owedPerMerchant).length === 0 ? <p className="text-slate-600 text-sm text-center py-10">All settled up!</p> : 
              Object.entries(owedPerMerchant).map(([mId, data]) => (
                <div key={mId} className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <p className="font-bold text-white text-lg">{data.merchantData?.storeName || 'Unknown Store'}</p>
                      <p className="text-xs text-slate-400">{data.merchantData?.bankName} - {data.merchantData?.bankAccount}</p>
                      <p className="text-xs text-slate-400">{data.merchantData?.ownerName}</p>
                    </div>
                    <div className="text-right bg-green-500/20 p-3 rounded-xl">
                      <p className="text-[10px] font-bold text-green-500 uppercase">ยอดโอน</p>
                      <p className="font-black text-xl text-green-400">{data.amount} ฿</p>
                    </div>
                  </div>
                  
                  {payingMerchant === mId ? (
                    <div className="bg-black/50 p-4 rounded-2xl mt-4">
                       <label className="w-full bg-slate-800 border border-slate-700 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer mb-4 hover:border-indigo-500">
                        {payoutSlip ? <img src={payoutSlip} className="max-h-32 object-contain" alt="payout slip"/> : <><Upload size={20} className="text-slate-500 mb-2"/><span className="text-xs font-bold text-indigo-400">แนบสลิปโอนเงิน</span></>}
                        <input type="file" accept="image/*" className="hidden" onChange={(e: any)=>{
                           const f = e.target.files?.[0];
                           if(f) compressImage(f, setPayoutSlip);
                        }} />
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => setPayingMerchant("")} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl text-xs font-bold">ยกเลิก</button>
                        <button onClick={() => executePayout(mId, data)} disabled={!payoutSlip || isActionLoading} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-xs font-bold disabled:opacity-50">ยืนยันการจ่าย</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPayingMerchant(mId)} className="w-full mt-2 bg-indigo-600/20 text-indigo-400 py-3 rounded-xl font-bold text-sm hover:bg-indigo-600/40">Mark as Paid</button>
                  )}
                </div>
              ))
            }
          </div>
        )}

      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, dark = false }: any) {
  if (dark) {
    return (
      <button onClick={onClick} className={`px-5 py-3 rounded-2xl font-bold text-xs whitespace-nowrap transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
        {label}
      </button>
    );
  }
  return (
    <button onClick={onClick} className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${active ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
      {label}
    </button>
  );
}

/* ==================== STUDENT DASHBOARD ==================== */
function StudentDashboardView({ user, userData, myPasses, allUsers, pendingPurchase, myPurchases, myRedemptions, onLogout, onBuyPass, onScan, showToast, onEditName }: any) {
  const activePasses = myPasses.filter((p: Pass) => p.remainingCoupons > 0);
  const totalCoupons = activePasses.reduce((sum: number, p: Pass) => sum + p.remainingCoupons, 0);

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] max-w-md mx-auto w-full relative">
      <Header title="My Wallet" subtitle={userData?.role} user={user} userData={userData} onLogout={onLogout} onEditName={onEditName} showToast={showToast} color="indigo" />
      
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-12 space-y-6 z-10 relative">
        
        {pendingPurchase && (
          <div className="bg-amber-100 rounded-3xl p-5 text-center border border-amber-200 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <Clock className="text-amber-500 animate-spin-slow" size={24} />
               <div className="text-left">
                 <h3 className="font-black text-amber-800 text-sm">รอตรวจสลิป</h3>
                 <p className="text-amber-700/70 text-[10px] font-bold">{pendingPurchase.totalAmount} บาท</p>
               </div>
             </div>
             <span className="bg-amber-200/50 text-amber-800 px-3 py-1 rounded-lg text-xs font-bold">Pending</span>
          </div>
        )}

        <Card className="flex flex-col items-center relative overflow-hidden animate-in zoom-in duration-500 !p-8">
          <div className="absolute top-0 w-full h-2 bg-indigo-500"></div>
          <div className="w-full text-center">
            <p className="uppercase text-[10px] font-black text-slate-400 tracking-widest mb-2 mt-2">รวมคูปองทั้งหมด</p>
            <div className="text-[6rem] font-black leading-none text-slate-900 mb-2">{totalCoupons}</div>
            <div className="bg-indigo-50 text-indigo-600 font-bold py-2.5 px-6 rounded-full inline-flex items-center gap-2 mb-8 text-sm border border-indigo-100">
              <Sparkles size={16}/> Total Value {totalCoupons * 20} ฿
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={onScan} className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg active:scale-95 shadow-xl shadow-indigo-200/50 flex items-center justify-center gap-2">
                <QrCode size={20}/> สแกนจ่าย
              </button>
              <button onClick={onBuyPass} className="flex-none bg-slate-100 text-slate-700 font-black px-5 rounded-2xl active:scale-95 hover:bg-slate-200 text-sm">
                + ซื้อเพิ่ม
              </button>
            </div>
          </div>
        </Card>

        {/* Feature 1: List passes by Store */}
        {activePasses.length > 0 && (
          <div>
            <h3 className="font-bold text-slate-800 text-sm mb-3 px-2">คูปองแยกร้านค้า</h3>
            <div className="space-y-3">
              {activePasses.map((p: Pass) => {
                const storeName = allUsers.find((u: UserData) => u.uid === p.merchantId)?.storeName || 'Unknown Store';
                return (
                  <div key={p.id} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-50 text-orange-500 p-2 rounded-xl"><Store size={18}/></div>
                      <p className="font-bold text-sm text-slate-800">{storeName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-indigo-600 text-lg">{p.remainingCoupons}</p>
                      <p className="text-[10px] text-slate-400">ใบ</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== MERCHANT DASHBOARD ==================== */
function MerchantDashboardView({ user, userData, redemptions, merchantPayouts, onLogout, showToast, onEditName }: any) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${user?.uid}&margin=10`;

  const togglePause = async () => {
    await updateDoc(doc(getFirestore(), 'users', user.uid), { isPaused: !userData?.isPaused });
    showToast(userData?.isPaused ? "เปิดรับออเดอร์แล้ว" : "ปิดรับออเดอร์ชั่วคราวแล้ว", "info");
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans w-full pb-12 max-w-md mx-auto relative">
      <Header title="Shop Center" subtitle={userData?.storeName || "Shop"} color="orange" onLogout={onLogout} user={user} userData={userData} showToast={showToast} onEditName={onEditName} />
      
      <div className="px-5 flex-1 w-full pt-6 space-y-6 animate-in slide-in-from-bottom-4 relative z-10">
        {!userData?.isApproved ? (
           <div className="bg-white text-center p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-xl font-black text-slate-800 mb-2">รออนุมัติ</h3>
             <p className="text-slate-500 text-xs">แอดมินกำลังตรวจสอบข้อมูลร้านค้า</p>
           </div>
        ) : (
          <>
            <div className="bg-white text-center p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-4">
                <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest relative z-10">รับคูปองแล้ววันนี้</p>
                <button onClick={togglePause} className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1 ${userData.isPaused ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  <Power size={14}/> {userData.isPaused ? 'ร้านปิด (Pause)' : 'ร้านเปิด'}
                </button>
              </div>
              <div className="text-[7rem] font-black leading-none text-orange-500 mb-6 relative z-10">{redemptions.filter((r: Redemption) => new Date(r.redeemedAt).toDateString() === new Date().toDateString()).length}</div>
              <div className="w-full bg-orange-50 py-4 rounded-2xl border border-orange-100 relative z-10">
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-widest mb-1">ยอดค้างจ่ายจากระบบ (รันออโต้)</p>
                <p className="text-3xl font-black text-orange-600">{redemptions.filter((r: Redemption) => r.payoutStatus !== 'paid').reduce((sum: number, r: Redemption) => sum + r.amount, 0)} ฿</p>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col items-center text-center">
               <p className="text-slate-800 font-black text-sm mb-4">QR Code สำหรับรับสิทธิ์</p>
               <img src={qrCodeUrl} className="w-40 h-40 object-contain rounded-xl mb-4" alt="Store QR" />
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">ประวัติการรับเงินโอนจากระบบ (Payouts)</h3>
              <div className="space-y-3">
                {merchantPayouts.length === 0 ? <p className="text-xs text-slate-400 text-center py-6 bg-white rounded-3xl border border-slate-100">ยังไม่มีรอบบิลจ่ายเงิน</p> : merchantPayouts.map((p: Payout) => (
                  <div key={p.id} className="bg-white p-5 rounded-[2rem] flex flex-col shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">รอบบิลชำระแล้ว</p>
                        <p className="text-[10px] text-slate-400">{new Date(p.paidAt).toLocaleDateString()}</p>
                      </div>
                      <p className="font-black text-green-600 text-lg">+{p.amount} ฿</p>
                    </div>
                    <img src={p.slipUrl} className="w-full h-32 object-cover rounded-xl bg-slate-50 border border-slate-100" onClick={()=>window.open(p.slipUrl)} alt="slip"/>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ==================== BUY PASS VIEW ==================== */
function BuyPassView({ settings, allUsers, onBack, user, showToast }: any) {
  const [numSets, setNumSets] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const totalAmount = Number(settings?.pricePerSet || 79) * numSets;

  const availableMerchants = allUsers.filter((u: UserData) => u.role === 'merchant' && u.isApproved && !u.isPaused);

  const handleConfirm = async () => {
    if (!selectedMerchant) return showToast("กรุณาเลือกร้านค้าก่อน", "error");
    if (!slip) return showToast("กรุณาอัปโหลดสลิปยืนยัน", "error");
    setIsLoading(true);
    try {
      await addDoc(collection(getFirestore(), 'purchases'), {
        studentUid: user.uid,
        merchantId: selectedMerchant,
        numSets,
        totalAmount,
        slipUrl: slip,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      showToast(`ส่งสลิปยอด ${totalAmount} บาท เรียบร้อย`, "success");
      onBack();
    } catch (e) {
      showToast("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6 font-sans flex flex-col max-w-md mx-auto w-full animate-in fade-in">
      <div className="flex items-center justify-between mb-6 pt-4">
        <button onClick={onBack} className="p-3 bg-slate-50 rounded-2xl text-slate-600 hover:bg-slate-100 active:scale-90"><ChevronLeft size={20}/></button>
        <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Buy Pass</h2>
        <div className="w-12"></div>
      </div>

      <div className="flex-1 space-y-5">
        
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">1. เลือกร้านค้าที่จะใช้คูปอง</p>
          <select value={selectedMerchant} onChange={e => setSelectedMerchant(e.target.value)} className="w-full p-4 rounded-2xl border border-slate-200 outline-none font-bold text-slate-700">
            <option value="">-- เลือกร้านค้า --</option>
            {availableMerchants.map((m: UserData) => (
              <option key={m.uid} value={m.uid}>{m.storeName} ({m.location})</option>
            ))}
          </select>
        </div>

        <div className="bg-slate-50 rounded-[2.5rem] p-6 text-center border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">2. จำนวนเซ็ต (1 เซ็ต = 5 ใบ)</p>
          <div className="flex justify-center items-center gap-6 mb-6">
            <button onClick={() => setNumSets((n: number) => Math.max(1, n-1))} className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Minus size={20}/></button>
            <div className="text-5xl font-black text-slate-800 w-16">{numSets}</div>
            <button onClick={() => setNumSets((n: number) => n+1)} className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-600 active:scale-90"><Plus size={20}/></button>
          </div>
          <div className="pt-4 border-t border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">ยอดที่ต้องชำระ</p>
            <p className="text-3xl font-black text-indigo-600">{totalAmount} <span className="text-xl">฿</span></p>
          </div>
        </div>

        {settings?.promptPayQr && (
          <div className="bg-slate-50 rounded-3xl p-6 text-center border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">3. Scan QR โอนเงิน</p>
            <img src={settings.promptPayQr} className="w-32 h-32 mx-auto rounded-[1rem] object-contain bg-white p-2 shadow-sm" alt="QR" />
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">4. อัปโหลดสลิปยืนยัน</p>
          <label className="border-2 border-dashed border-indigo-200 bg-indigo-50/30 rounded-3xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 transition-all overflow-hidden relative">
            {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip" /> : (
              <div className="text-center"><Upload size={32} className="text-indigo-300 mx-auto mb-2" /><p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">อัปโหลดสลิปที่นี่</p></div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e: any)=>{
              const f = e.target.files?.[0];
              if(f) compressImage(f, setSlip);
            }} />
          </label>
        </div>
      </div>

      <button onClick={handleConfirm} disabled={!slip || !selectedMerchant || isLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.5rem] text-lg mt-6 active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-200/50">
        {isLoading ? <Loader2 className="animate-spin mx-auto"/> : "ยืนยันส่งหลักฐาน"}
      </button>
    </div>
  );
}

/* ==================== SCAN QR VIEW ==================== */
function ScanQRView({ onBack, myPasses, myRedemptions, allUsers, user, onSuccess, showToast }: any) {
  const [shopId, setShopId] = useState("");
  const [useCount, setUseCount] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let html5QrCode: any = null;
    if (isScanning) {
      const initScanner = async () => {
        if (!(window as any).Html5Qrcode) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode';
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        if (!isScanning) return; 
        setTimeout(() => {
          try {
            html5QrCode = new (window as any).Html5Qrcode("qr-reader");
            html5QrCode.start(
              { facingMode: "environment" },
              { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
              (decodedText: string) => {
                setShopId(decodedText.trim());
                setIsScanning(false);
                showToast("สแกนสำเร็จ ระบุจำนวนคูปองและกดยืนยัน", "success");
                if (html5QrCode) { html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.log); html5QrCode = null; }
              },
              () => { /* ignore */ }
            ).catch((err: any) => { setIsScanning(false); });
          } catch(e) { setIsScanning(false); }
        }, 300);
      };
      initScanner();
    }
    return () => { if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.log); };
  }, [isScanning]);

  const handleRedeem = async () => {
    const cleanShopId = shopId.trim();
    if (!cleanShopId) return showToast("กรุณาระบุ Shop ID", "error");

    const targetPass = myPasses.find((p: Pass) => p.merchantId === cleanShopId && p.remainingCoupons >= useCount);
    if (!targetPass) return showToast("คุณไม่มีคูปองสำหรับร้านนี้ หรือคูปองไม่พอ", "error");

    const lastRedemption = myRedemptions.filter((r: Redemption) => r.merchantId === cleanShopId).sort((a: Redemption, b: Redemption) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime())[0];
    if (lastRedemption) {
      const diffMins = (new Date().getTime() - new Date(lastRedemption.redeemedAt).getTime()) / 60000;
      if (diffMins < 5) return showToast(`กรุณารออีก ${Math.ceil(5 - diffMins)} นาทีก่อนสแกนซ้ำ`, "error");
    }

    setIsProcessing(true);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'passes', targetPass.id), { remainingCoupons: increment(-useCount) });
      await addDoc(collection(db, 'redemptions'), { 
        studentUid: user.uid, 
        merchantId: cleanShopId, 
        amount: 20 * useCount,
        couponsUsed: useCount,
        payoutStatus: 'pending',
        redeemedAt: new Date().toISOString() 
      });
      onSuccess();
    } catch (e) {
      showToast("เกิดข้อผิดพลาด", "error");
    } finally { setIsProcessing(false); }
  };

  const storeInfo = allUsers.find((u: UserData) => u.uid === shopId);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center max-w-md mx-auto font-sans relative overflow-y-auto pb-10">
      <div className="absolute top-8 left-6 z-10">
        <button onClick={onBack} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90"><ChevronLeft size={24}/></button>
      </div>

      <div className="w-full mt-16 animate-in slide-in-from-bottom-8 duration-500">
        <h2 className="text-3xl font-black mb-6 italic tracking-tighter text-center text-indigo-400">Scan to Pay</h2>
        
        <div className={`w-full aspect-square bg-black rounded-[3rem] relative overflow-hidden flex items-center justify-center border border-slate-800 shadow-2xl mb-6 ${isScanning ? 'border-indigo-500 shadow-[0_0_60px_rgba(99,102,241,0.3)]' : ''}`}>
          {isScanning ? (
            <div id="qr-reader" className="w-full h-full bg-black absolute inset-0"></div>
          ) : (
            <div className="text-center">
              <Camera size={60} className="text-slate-700 mx-auto mb-4" />
              <button onClick={() => setIsScanning(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-sm active:scale-95 flex items-center gap-2 mx-auto">
                <ScanLine size={18} /> เปิดกล้อง
              </button>
            </div>
          )}
          {isScanning && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_20px_#6366f1] animate-[scan_3s_ease-in-out_infinite]"></div>}
          <style>{`@keyframes scan { 0% { top: 10%; opacity:0; } 20% {opacity:1;} 80% {opacity:1;} 100% { top: 90%; opacity:0; } }`}</style>
        </div>

        {isScanning && (
          <div className="text-center mb-4">
            <button onClick={() => setIsScanning(false)} className="bg-slate-800 text-slate-300 font-bold px-6 py-2.5 rounded-full text-xs uppercase tracking-widest active:scale-95 border border-slate-700">ปิดกล้อง</button>
          </div>
        )}

        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800">
          <input type="text" placeholder="หรือพิมพ์ SHOP ID" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
            className="w-full bg-black/50 text-center text-xl font-mono p-4 rounded-2xl outline-none focus:border-indigo-500 transition-all uppercase mb-4 border border-slate-800 text-indigo-300" />
          
          {storeInfo && (
            <div className="bg-indigo-900/30 border border-indigo-500/30 p-3 rounded-xl mb-4 text-center">
              <p className="text-xs text-indigo-300 font-bold">กำลังจะจ่ายให้: {storeInfo.storeName}</p>
            </div>
          )}

          <div className="flex items-center justify-between bg-black/30 p-2 rounded-2xl mb-6 border border-slate-800">
             <span className="text-xs font-bold text-slate-400 pl-4">จำนวนคูปอง:</span>
             <div className="flex bg-slate-800 rounded-xl">
               <button onClick={()=>setUseCount(1)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${useCount===1?'bg-indigo-600 text-white':'text-slate-400'}`}>1</button>
               <button onClick={()=>setUseCount(2)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${useCount===2?'bg-indigo-600 text-white':'text-slate-400'}`}>2</button>
             </div>
          </div>

          <button onClick={handleRedeem} disabled={!shopId || isProcessing} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-lg active:scale-95 disabled:opacity-50">
            {isProcessing ? <Loader2 className="animate-spin mx-auto" size={24}/> : `ยืนยันจ่าย ${useCount} คูปอง`}
          </button>
        </div>
      </div>

      <style>{`
        #qr-reader { width: 100% !important; height: 100% !important; border: none !important; }
        #qr-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; border-radius: 3rem !important; }
      `}</style>
    </div>
  );
}

function SuccessView({ onDone }: any) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#10b981] text-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 max-w-md mx-auto w-full relative overflow-hidden">
      <div className="bg-white/20 p-4 rounded-full mb-8 relative z-10">
        <div className="bg-white text-[#10b981] p-8 rounded-full shadow-2xl animate-bounce">
          <CheckCircle size={80} strokeWidth={3.5} />
        </div>
      </div>
      <h1 className="text-5xl font-black mb-10 tracking-tight drop-shadow-md relative z-10">สำเร็จ!</h1>
      <div className="text-6xl font-mono font-black tracking-tighter mb-20 opacity-90 drop-shadow-md animate-pulse relative z-10">
        {time.toLocaleTimeString('en-US', { hour12: false })}
      </div>
      <button onClick={onDone} className="bg-white text-[#10b981] w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all uppercase tracking-widest relative z-10 max-w-xs">
        กลับหน้าหลัก
      </button>
    </div>
  );
}