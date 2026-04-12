"use client";

import React, { useEffect, useState } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn, Users, 
  Upload, CheckCircle, Camera, LogOut, Settings, Save, RefreshCw, 
  Plus, Minus, Eye, EyeOff, Copy, Sparkles, Image as ImageIcon,
  XCircle, ScanLine, Edit2, MapPin, AlertTriangle, MessageSquareWarning, 
  Download, FileText, Info, Trash2, ArrowDownLeft, ArrowUpRight, Receipt,
  ChevronRight, Building, CreditCard, Power, PowerOff, Store as StoreIcon, X
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
  payoutStatus?: 'pending' | 'paid'; 
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
  platformFee: number; 
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

  // System Wide States
  const [allPurchases, setAllPurchases] = useState<PurchaseSlip[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [allPasses, setAllPasses] = useState<Pass[]>([]);
  const [allRedemptions, setAllRedemptions] = useState<Redemption[]>([]);
  const [allPayouts, setAllPayouts] = useState<Payout[]>([]);
  const [allReports, setAllReports] = useState<ReportIssue[]>([]);
  
  // Merchant States
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [merchantSales, setMerchantSales] = useState<PurchaseSlip[]>([]);
  const [merchantPayouts, setMerchantPayouts] = useState<Payout[]>([]);
  const [systemSettings, setSystemSettings] = useState<AppSettings>({ pricePerSet: 79, platformFee: 9, promptPayQr: null });

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

    const unsubscribe = onAuthStateChanged(auth, async (currentUser: any) => {
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

    unsubs.push(onSnapshot(doc(db, 'settings', 'global'), (snap: any) => {
      if (snap.exists()) {
        const data = snap.data() as AppSettings;
        setSystemSettings({
          pricePerSet: Number(data.pricePerSet) || 79,
          platformFee: Number(data.platformFee) || 9,
          promptPayQr: data.promptPayQr
        });
      }
    }));

    if (['student', 'guest'].includes(currentView) || currentView === 'buy_pass' || currentView === 'scan_qr') {
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap: any) => {
        const passes = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({id: d.id, ...d.data()} as Pass));
        setMyPasses(passes);
      }));

      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap: any) => {
        const purchases = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip));
        setMyPurchases(purchases);
        const pending = purchases.find((p: PurchaseSlip) => p.status === 'pending');
        setPendingPurchase(pending || null);
      }));

      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap: any) => {
        const reds = snap.docs.filter((d: any) => d.data().studentUid === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        setMyRedemptions(reds);
      }));

      unsubs.push(onSnapshot(collection(db, 'users'), (snap: any) => {
        setAllUsers(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserData)));
      }));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap: any) => {
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Redemption));
        filtered.sort((a: Redemption, b: Redemption) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());
        setRedemptions(filtered);
      }));

      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap: any) => {
        const sales = snap.docs.filter((d: any) => d.data().merchantId === user.uid && d.data().status === 'approved').map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip));
        setMerchantSales(sales);
      }));

      unsubs.push(onSnapshot(collection(db, 'payouts'), (snap: any) => {
        const filtered = snap.docs.filter((d: any) => d.data().merchantId === user.uid).map((d: any) => ({ id: d.id, ...d.data() } as Payout));
        filtered.sort((a: Payout, b: Payout) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
        setMerchantPayouts(filtered);
      }));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(collection(db, 'purchases'), (snap: any) => {
        setAllPurchases(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as PurchaseSlip)));
      }));
      unsubs.push(onSnapshot(collection(db, 'users'), (snap: any) => {
        setAllUsers(snap.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserData)));
      }));
      unsubs.push(onSnapshot(collection(db, 'passes'), (snap: any) => {
        setAllPasses(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Pass)));
      }));
      unsubs.push(onSnapshot(collection(db, 'redemptions'), (snap: any) => {
        setAllRedemptions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Redemption)));
      }));
      unsubs.push(onSnapshot(collection(db, 'payouts'), (snap: any) => {
        setAllPayouts(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Payout)));
      }));
      unsubs.push(onSnapshot(collection(db, 'reports'), (snap: any) => {
        const reports = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as ReportIssue));
        reports.sort((a: ReportIssue, b: ReportIssue) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllReports(reports);
      }));
    }

    unsubs.push(onSnapshot(doc(db, 'users', user.uid), (snap: any) => {
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
    } catch (e: any) {
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
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center w-full">
        <Ticket className="w-12 h-12 animate-pulse text-indigo-600 mb-4" />
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen sm:h-screen sm:min-h-0 w-full bg-slate-200 flex items-center justify-center font-sans text-slate-800 sm:p-6">
      
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

      {/* Adaptive Mobile/Desktop Wrapper (Mobile Mockup on Desktop) */}
      <div className="w-full h-full min-h-screen sm:min-h-0 sm:max-h-[850px] sm:max-w-[400px] bg-[#F9FAFB] sm:rounded-[3rem] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 relative flex flex-col overflow-hidden mx-auto">
        
        {/* Main Content Area */}
        <div className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden bg-[#F9FAFB] relative flex flex-col scrollbar-hide">
          {currentView === 'auth' && <AuthScreenView authMode={authMode} setAuthMode={setAuthMode} onAuth={handleAuthAction} onRoleSelect={handleRoleSelect} isActionLoading={isActionLoading} showToast={showToast} onGoogleAuth={handleGoogleAuth} onForgotPassword={handleForgotPassword} onLogout={handleLogout} user={user} />}
          
          {currentView === 'admin' && <AdminDashboardView 
            allPurchases={allPurchases} 
            allUsers={allUsers} 
            allPasses={allPasses}
            allRedemptions={allRedemptions}
            allPayouts={allPayouts}
            allReports={allReports}
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
          
          {currentView === 'merchant' && <MerchantDashboardView user={user} userData={userData} redemptions={redemptions} merchantSales={merchantSales} merchantPayouts={merchantPayouts} systemSettings={systemSettings} onLogout={handleLogout} showToast={showToast} onEditName={handleEditName} />}
          
          {currentView === 'buy_pass' && <BuyPassView settings={systemSettings} allUsers={allUsers} onBack={() => setCurrentView(userData?.role || 'student')} user={user} showToast={showToast} />}
          
          {currentView === 'scan_qr' && <ScanQRView onBack={() => setCurrentView(userData?.role || 'student')} myPasses={myPasses} myRedemptions={myRedemptions} allUsers={allUsers} user={user} onSuccess={() => setCurrentView('success')} showToast={showToast} />}
          
          {currentView === 'success' && <SuccessView onDone={() => setCurrentView(userData?.role || 'student')} />}
        </div>
      </div>
    </div>
  );
}

/* ==================== SUB COMPONENTS ==================== */

function Header({ title, subtitle, color = "indigo", onLogout, user, userData, showToast, onEditName }: any) {
  const bgColors: Record<string, string> = { indigo: "bg-indigo-600", orange: "bg-orange-500", slate: "bg-slate-900" };
  const bgClass = bgColors[color] || bgColors.indigo;

  return (
    <div className={`${bgClass} text-white px-6 py-10 rounded-b-[3rem] shadow-lg relative overflow-hidden w-full transition-all duration-500 shrink-0`}>
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
      <div className="w-full h-full min-h-full flex flex-col items-center justify-center p-6 bg-white">
        <div className="w-full animate-in fade-in duration-500">
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
    <div className="w-full h-full min-h-full flex flex-col items-center justify-center p-6 bg-white relative">
      <div className="w-full animate-in fade-in duration-700 pb-10">
        
        {authMode !== 'merchant_setup' && (
          <div className="flex flex-col items-center mb-8 pt-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-200 mb-6 rotate-3">
              <Ticket size={40} className="text-white" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          </div>
        )}

        {authMode === 'role_setup' ? (
          <div className="space-y-4 animate-in slide-in-from-bottom-4">
            <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest mb-6">เลือกบทบาทของคุณ</p>
            <RoleButton icon={<User />} title="นักศึกษา" onClick={() => user ? onRoleSelect('student') : onGoogleAuth()} color="indigo" />
            <RoleButton icon={<Users />} title="บุคคลทั่วไป" onClick={() => user ? onRoleSelect('guest') : onGoogleAuth()} color="blue" />
            <RoleButton icon={<Store />} title="ร้านค้า (Partner)" onClick={() => setAuthMode('merchant_setup')} color="orange" />
            
            <div className="text-center mt-6 pt-4 border-t border-slate-100">
              <button onClick={onLogout} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors py-2 px-4">
                ยกเลิก / กลับไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          </div>
        ) : authMode === 'merchant_setup' ? (
          <form onSubmit={handleMerchantSubmit} className="space-y-4 animate-in slide-in-from-right-4 pt-10 pb-10 px-2">
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
                <input type="checkbox" checked={acceptedPolicy} onChange={(e: any) => setAcceptedPolicy(e.target.checked)} className="mt-1 shrink-0" />
                <span className="text-[10px] text-orange-900 leading-tight">ข้าพเจ้ายินยอมให้หักค่าธรรมเนียมแพลตฟอร์ม, รับโอนเงินรายสัปดาห์, และยอมรับเงื่อนไขทางกฎหมายหากพบการทุจริต</span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setAuthMode('role_setup')} className="w-1/3 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-sm hover:bg-slate-200">ยกเลิก</button>
              <button type="submit" className="w-2/3 bg-orange-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 text-sm">ส่งคำขอเปิดร้าน</button>
            </div>
          </form>
        ) : (
          <>
            {/* Student Notice Banner */}
            <div className="w-full mb-6 animate-in fade-in">
              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex gap-3 shadow-sm items-start">
                <AlertTriangle className="text-indigo-500 shrink-0 mt-0.5" size={20} />
                <div className="text-left text-xs text-indigo-800 leading-relaxed">
                  <span className="font-bold block mb-0.5">สำหรับนักศึกษา:</span>
                  โปรดสมัครหรือเข้าสู่ระบบด้วยอีเมล <span className="font-mono bg-indigo-100 px-1 rounded">@lamduan.mfu.ac.th</span> เท่านั้น
                </div>
              </div>
            </div>

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
function AdminDashboardView({ allPurchases, allUsers, allPasses, allRedemptions, allPayouts, allReports, systemSettings, onLogout, showToast, user, userData, onEditName, setIsActionLoading, isActionLoading }: any) {
  const [adminTab, setAdminTab] = useState<'overview' | 'slips' | 'partners' | 'users' | 'settings'>('overview');
  const [selectedMerchantForDetails, setSelectedMerchantForDetails] = useState<UserData | null>(null);
  const db = getFirestore();

  const [pricePerSet, setPricePerSet] = useState(systemSettings.pricePerSet || 79);
  const [platformFee, setPlatformFee] = useState(systemSettings.platformFee || 9);
  const [promptPayQr, setPromptPayQr] = useState(systemSettings.promptPayQr || "");

  const pendingSlips = allPurchases.filter((s: PurchaseSlip) => s.status === 'pending');
  const approvedPurchases = allPurchases.filter((s: PurchaseSlip) => s.status === 'approved');
  const pendingMerchants = allUsers.filter((u: UserData) => u.role === 'merchant' && !u.isApproved && !u.isRejected);
  const approvedMerchants = allUsers.filter((u: UserData) => u.role === 'merchant' && u.isApproved);
  const studentAndGuests = allUsers.filter((u: UserData) => u.role === 'student' || u.role === 'guest');
  const pendingReports = allReports?.filter((r: ReportIssue) => r.status === 'pending') || [];
  
  // Advanced Financial Calculations (With Safe Fallbacks)
  const sysPrice = Number(systemSettings?.pricePerSet) || 79;
  const sysFee = Number(systemSettings?.platformFee) || 9;

  const totalApprovedSets = approvedPurchases.reduce((sum: number, p: PurchaseSlip) => sum + Number(p.numSets), 0);
  const totalGrossRevenue = totalApprovedSets * sysPrice; 
  const totalPlatformRevenue = totalApprovedSets * sysFee; 
  const totalPayableStore = totalApprovedSets * (sysPrice - sysFee);

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'global'), { pricePerSet: Number(pricePerSet), platformFee: Number(platformFee), promptPayQr }, { merge: true });
    showToast("บันทึกการตั้งค่าสำเร็จ", "success");
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return showToast('กรุณาอัปโหลดรูปภาพ', 'error');
      compressImage(file, setPromptPayQr);
    }
  };

  const handleApproveSlip = async (slip: PurchaseSlip) => {
    try {
      const db = getFirestore();
      // Feature 1: Pass is specific to Merchant
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

  const executePayout = async (merchantId: string, unpaidPurchases: PurchaseSlip[], amountOwed: number) => {
    if(!payoutSlip) return showToast("กรุณาแนบสลิปโอนเงินก่อน", "error");
    setIsActionLoading(true);
    try {
      await addDoc(collection(db, 'payouts'), {
        merchantId, amount: amountOwed, slipUrl: payoutSlip, paidAt: new Date().toISOString()
      });
      const batchPromises = unpaidPurchases.map((p: PurchaseSlip) => updateDoc(doc(db, 'purchases', p.id), { payoutStatus: 'paid' }));
      await Promise.all(batchPromises);
      showToast("บันทึกการโอนเงินสำเร็จ", "success");
      setPayoutSlip(""); setPayingMerchant("");
    } catch(e) { showToast("Error", "error"); }
    setIsActionLoading(false);
  };

  const handleEditCoupons = async (studentUid: string, passId?: string, currentAmount?: number) => {
    const newAmountStr = prompt(`ระบุจำนวนคูปองใหม่ (ปัจจุบัน: ${currentAmount || 0} ใบ):`, currentAmount ? String(currentAmount) : "0");
    if (newAmountStr === null) return; 
    const newAmount = parseInt(newAmountStr);
    if (isNaN(newAmount) || newAmount < 0) return showToast("กรุณาระบุตัวเลขที่ถูกต้อง", "error");

    try {
      if (passId) {
        await updateDoc(doc(db, 'passes', passId), { remainingCoupons: newAmount });
      } else {
        await addDoc(collection(db, 'passes'), { studentUid, merchantId: "SYSTEM", remainingCoupons: newAmount });
      }
      showToast("อัปเดตจำนวนคูปองสำเร็จ", "success");
    } catch (e) {
      showToast("เกิดข้อผิดพลาดในการอัปเดตคูปอง", "error");
    }
  };

  const handleSystemReset = async (resetType: 'soft' | 'hard') => {
    const isHard = resetType === 'hard';
    const warningMsg = isHard 
      ? "⚠️ คำเตือน (Hard Reset): ลบข้อมูลทุกอย่าง รวมถึง 'บัญชีผู้ใช้' ทุกคนต้องสมัครใหม่ (ยกเว้นแอดมิน) คุณแน่ใจหรือไม่?" 
      : "⚠️ คำเตือน (Soft Reset): ลบเฉพาะข้อมูลธุรกรรม (คูปอง, สลิป, ประวัติ) แต่ 'เก็บบัญชีผู้ใช้ไว้' คุณแน่ใจหรือไม่?";
      
    const confirmReset = window.confirm(warningMsg);
    if (!confirmReset) return;

    const passCode = window.prompt("กรุณากรอกรหัสยืนยันการรีเซ็ตระบบ (6 หลัก):");
    if (passCode !== "842019") {
      showToast("รหัสยืนยันไม่ถูกต้อง ยกเลิกการทำรายการ", "error");
      return;
    }

    setIsActionLoading(true);
    try {
      const clearCollection = async (colName: string) => {
        const snap = await getDocs(collection(db, colName));
        const promises = snap.docs.map((d: any) => deleteDoc(d.ref));
        await Promise.all(promises);
      };

      // Clear all transactional data
      await clearCollection('passes');
      await clearCollection('purchases');
      await clearCollection('redemptions');
      await clearCollection('reports');
      await clearCollection('payouts');

      // Only clear users if Hard Reset
      if (isHard) {
        const usersSnap = await getDocs(collection(db, 'users'));
        const userDeletePromises = usersSnap.docs.map((d: any) => {
          if (d.data().email !== ADMIN_EMAIL) {
            return deleteDoc(d.ref);
          }
          return Promise.resolve();
        });
        await Promise.all(userDeletePromises);
        showToast("Hard Reset สำเร็จ: ล้างข้อมูลและบัญชีทั้งหมดแล้ว", "success");
      } else {
        showToast("Soft Reset สำเร็จ: ล้างข้อมูลธุรกรรมเรียบร้อยแล้ว", "success");
      }
    } catch (error) {
      showToast("เกิดข้อผิดพลาดในการรีเซ็ตระบบ", "error");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-full w-full bg-slate-950 text-white pb-10">
      <Header title="Admin Console" subtitle="System Control" onLogout={onLogout} user={user} userData={userData} onEditName={onEditName} color="slate" showToast={showToast} />
      
      <div className="px-6 pt-2 pb-2 flex gap-2 overflow-x-auto scrollbar-hide bg-slate-950 shrink-0">
        <TabButton active={adminTab==='overview'} onClick={()=>setAdminTab('overview')} label="Overview" dark />
        <TabButton active={adminTab==='slips'} onClick={()=>setAdminTab('slips')} label={`Slips (${pendingSlips.length})`} dark />
        <TabButton active={adminTab==='partners'} onClick={()=>setAdminTab('partners')} label={`Partners (${approvedMerchants.length})`} dark />
        <TabButton active={adminTab==='users'} onClick={()=>setAdminTab('users')} label={`Users (${studentAndGuests.length})`} dark />
        <TabButton active={adminTab==='settings'} onClick={()=>setAdminTab('settings')} label="Settings" dark />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {adminTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Financial Metrics */}
            <div className="bg-slate-900 rounded-[2rem] p-6 border border-slate-800 shadow-xl text-center">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">ยอดเงินรวมก่อนหัก (Total Gross)</p>
              <p className="text-5xl font-black text-white mb-6">{totalGrossRevenue.toLocaleString()} <span className="text-2xl text-slate-500">฿</span></p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 p-4 rounded-2xl">
                  <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-1">ส่วนแบ่งเรา (Platform)</p>
                  <p className="text-2xl font-black text-indigo-300">{totalPlatformRevenue.toLocaleString()} ฿</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-2xl">
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest mb-1">ต้องให้ร้าน (Payable)</p>
                  <p className="text-2xl font-black text-green-300">{totalPayableStore.toLocaleString()} ฿</p>
                </div>
              </div>
              <p className="text-slate-500 text-[10px] mt-4">จำนวนการซื้อพาสทั้งหมด: {totalApprovedSets} เซ็ต</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">รอยืนยันสลิป</p>
                <p className="text-3xl font-black text-amber-400">{pendingSlips.length}</p>
              </div>
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">ร้านค้าใหม่</p>
                <p className="text-3xl font-black text-blue-400">{pendingMerchants.length}</p>
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
            
            {/* Reports Section */}
            {pendingReports.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-300 mb-4 text-sm uppercase tracking-widest">ปัญหาจากผู้ใช้ ({pendingReports.length})</h3>
                {pendingReports.map((r: ReportIssue) => (
                  <div key={r.id} className="bg-red-500/10 p-5 rounded-3xl mb-3 border border-red-500/20">
                    <p className="text-sm text-red-400 font-medium mb-2">"{r.issue}"</p>
                    <p className="text-[10px] text-slate-500 font-mono mb-4">{r.email}</p>
                    <button onClick={() => { updateDoc(doc(db, 'reports', r.id), { status: 'resolved' }); showToast("Resolved", "success"); }} 
                      className="w-full bg-red-600/20 text-red-400 font-bold py-3 rounded-xl text-xs hover:bg-red-600/40">
                      Mark as Resolved
                    </button>
                  </div>
                ))}
              </div>
            )}
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

        {adminTab === 'partners' && (
          <div className="space-y-4 animate-in fade-in">
            {approvedMerchants.length === 0 ? <p className="text-slate-600 text-sm text-center py-10">No approved partners.</p> : 
              approvedMerchants.map((m: UserData) => {
                const unpaidPurchases = approvedPurchases.filter((p: PurchaseSlip) => p.merchantId === m.uid && p.payoutStatus !== 'paid');
                const unpaidSets = unpaidPurchases.reduce((sum: number, p: PurchaseSlip) => sum + Number(p.numSets), 0);
                const owedAmount = unpaidSets * (sysPrice - sysFee);

                return (
                  <div key={m.uid} className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
                    <div className="flex items-center gap-4 mb-4">
                      {m.storeImage ? <img src={m.storeImage} className="w-14 h-14 rounded-xl object-cover" alt="Store"/> : <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center"><StoreIcon size={24} className="text-slate-500"/></div>}
                      <div className="flex-1">
                        <p className="font-bold text-white text-lg">{m.storeName}</p>
                        <p className="text-xs text-slate-400">{m.location}</p>
                      </div>
                      <button onClick={() => setSelectedMerchantForDetails(m)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20"><Info size={16}/></button>
                    </div>
                    
                    <div className="bg-slate-800 p-4 rounded-2xl flex justify-between items-center mb-4">
                       <div>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">ค้างโอน (ยอดขาย: {unpaidSets} เซ็ต)</p>
                         <p className="font-black text-2xl text-green-400">{owedAmount} ฿</p>
                       </div>
                       <button onClick={() => setPayingMerchant(m.uid)} className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold text-xs shadow-md active:scale-95">โอนให้ร้านค้า</button>
                    </div>
                    
                    {payingMerchant === m.uid && (
                      <div className="bg-black/50 p-4 rounded-2xl mt-4 animate-in slide-in-from-top-2">
                         <label className="w-full bg-slate-800 border border-slate-700 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer mb-4 hover:border-indigo-500">
                          {payoutSlip ? <img src={payoutSlip} className="max-h-32 object-contain" alt="payout slip"/> : <><Upload size={20} className="text-slate-500 mb-2"/><span className="text-xs font-bold text-indigo-400">แนบสลิปโอนเงิน ({owedAmount}฿)</span></>}
                          <input type="file" accept="image/*" className="hidden" onChange={(e: any)=>{
                             const f = e.target.files?.[0];
                             if(f) compressImage(f, setPayoutSlip);
                          }} />
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => {setPayingMerchant(""); setPayoutSlip("");}} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl text-xs font-bold">ยกเลิก</button>
                          <button onClick={() => executePayout(m.uid, unpaidPurchases, owedAmount)} disabled={!payoutSlip || isActionLoading || unpaidPurchases.length === 0} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-xs font-bold disabled:opacity-50">ยืนยันการจ่าย</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            }
          </div>
        )}

        {adminTab === 'users' && (
          <div className="space-y-3 animate-in fade-in">
            {studentAndGuests.map((u: any) => {
              const pass = allPasses.find((p: Pass) => p.studentUid === u.uid);
              return (
                <div key={u.uid} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 flex justify-between items-center">
                  <div className="truncate pr-2">
                    <p className="font-bold text-sm text-white truncate">{u.displayName || u.email}</p>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">{u.role}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEditCoupons(u.uid, pass?.id, pass?.remainingCoupons)}
                      className="bg-indigo-600/20 text-indigo-400 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-600/40 border border-indigo-500/20"
                    >
                      {pass?.remainingCoupons || 0} CPN
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {adminTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in pb-10">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 border border-slate-800">
              <h3 className="font-bold text-white mb-6 text-lg">Financial Setup</h3>
              <div className="mb-6">
                <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest">ราคา 1 เซ็ต (5 คูปอง)</p>
                <input type="number" value={pricePerSet} onChange={(e: any) => setPricePerSet(e.target.value)} 
                  className="w-full bg-black/50 text-3xl font-black rounded-2xl p-5 outline-none border border-slate-700 focus:border-indigo-500 text-white text-center" />
              </div>
              <div className="mb-6">
                <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest">ส่วนแบ่งแพลตฟอร์ม (ต่อ 1 เซ็ต)</p>
                <input type="number" value={platformFee} onChange={(e: any) => setPlatformFee(e.target.value)} 
                  className="w-full bg-black/50 text-2xl font-black rounded-2xl p-5 outline-none border border-slate-700 focus:border-indigo-500 text-indigo-300 text-center" />
              </div>
              <div className="mb-8">
                <p className="text-slate-400 text-xs font-bold mb-3 uppercase tracking-widest">PromptPay QR Code</p>
                <label className="w-full bg-black/30 border border-slate-700 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer mb-4 hover:border-indigo-500 transition-colors">
                  <Upload size={24} className="text-slate-500 mb-2"/>
                  <span className="text-indigo-400 font-bold text-xs uppercase tracking-widest">Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} />
                </label>
                {promptPayQr && <img src={promptPayQr} className="max-h-48 mx-auto rounded-2xl border border-slate-700 mb-4" alt="QR Preview" />}
              </div>
              <button onClick={saveSettings} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black active:scale-95 transition-all text-lg shadow-lg shadow-indigo-900/20">Save Settings</button>
            </div>

            {/* DANGER ZONE - 2 Options */}
            <div className="bg-red-500/10 rounded-[2.5rem] p-8 border border-red-500/20 text-center">
              <AlertTriangle className="text-red-500 mx-auto mb-4" size={40} />
              <h3 className="font-black text-red-500 mb-2 text-xl">Danger Zone (รีเซ็ตระบบ)</h3>
              
              <div className="space-y-4 text-left mt-6">
                {/* Soft Reset */}
                <div className="bg-black/20 p-5 rounded-2xl border border-red-500/20">
                  <h4 className="font-bold text-red-400 text-sm mb-1">1. Soft Reset (ล้างเฉพาะข้อมูล)</h4>
                  <p className="text-xs text-slate-400 mb-4">ล้างคูปอง สลิป ประวัติทั้งหมด แต่ <span className="text-white font-bold">เก็บบัญชีผู้ใช้ไว้</span> ไม่ต้องสมัครใหม่</p>
                  <button onClick={() => handleSystemReset('soft')} disabled={isActionLoading} className="w-full bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold py-3 rounded-xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 border border-red-500/30">
                    {isActionLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Soft Reset
                  </button>
                </div>

                {/* Hard Reset */}
                <div className="bg-red-900/40 p-5 rounded-2xl border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                  <h4 className="font-bold text-red-400 text-sm mb-1">2. Hard Reset (ล้างทั้งหมด)</h4>
                  <p className="text-xs text-red-300/80 mb-4">ล้างทุกอย่าง รวมถึง <span className="text-white font-bold">ลบบัญชีผู้ใช้ทั้งหมด</span> (ยกเว้นแอดมิน) ต้องสมัครใหม่</p>
                  <button onClick={() => handleSystemReset('hard')} disabled={isActionLoading} className="w-full bg-red-600 text-white font-black py-4 rounded-xl active:scale-95 transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-900/50 disabled:opacity-50">
                    {isActionLoading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />} Hard Reset
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Modal for Merchant Details */}
      {selectedMerchantForDetails && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="relative h-48 bg-slate-800 shrink-0">
               {selectedMerchantForDetails.storeImage ? <img src={selectedMerchantForDetails.storeImage} className="w-full h-full object-cover" alt="store" /> : <div className="w-full h-full flex items-center justify-center"><StoreIcon size={48} className="text-slate-600"/></div>}
               <button onClick={()=>setSelectedMerchantForDetails(null)} className="absolute top-4 right-4 bg-black/50 p-2 rounded-full text-white backdrop-blur-md hover:bg-black/70"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <h2 className="text-2xl font-black text-white mb-1">{selectedMerchantForDetails.storeName}</h2>
              <p className="text-slate-400 text-sm mb-6 flex items-center gap-1"><MapPin size={14}/> {selectedMerchantForDetails.location} ({selectedMerchantForDetails.category})</p>
              
              <div className="space-y-4 bg-black/40 p-5 rounded-2xl">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">เจ้าของร้าน</p>
                  <p className="text-sm font-medium text-slate-200">{selectedMerchantForDetails.ownerName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">ข้อมูลธนาคาร</p>
                  <p className="text-sm font-medium text-slate-200">{selectedMerchantForDetails.bankName}</p>
                  <p className="text-lg font-mono text-indigo-400 mt-1">{selectedMerchantForDetails.bankAccount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">การติดต่อ</p>
                  <p className="text-sm font-medium text-slate-200">{selectedMerchantForDetails.email}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">รหัสร้านค้า (Shop ID)</p>
                  <p className="text-[10px] font-mono text-slate-500 break-all select-all">{selectedMerchantForDetails.uid}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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

  const handleReport = async () => {
    const issue = prompt("ระบุปัญหาที่พบ หรือข้อเสนอแนะ:");
    if(issue && issue.trim() !== "") {
      try {
        await addDoc(collection(getFirestore(), 'reports'), {
          studentUid: user.uid, email: user.email, issue: issue.trim(), status: 'pending', createdAt: new Date().toISOString()
        });
        showToast("ส่งรายงานให้ผู้ดูแลระบบแล้วครับ", "success");
      } catch (e) { showToast("ไม่สามารถส่งรายงานได้", "error"); }
    }
  };

  const history = [
    ...(myPurchases || []).map((p: any) => ({ ...p, type: 'purchase' as const, date: new Date(p.createdAt) })),
    ...(myRedemptions || []).map((r: any) => ({ ...r, type: 'redemption' as const, date: new Date(r.redeemedAt) }))
  ].sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col h-full min-h-full w-full bg-[#F9FAFB] relative">
      <Header title="My Wallet" subtitle={userData?.role} user={user} userData={userData} onLogout={onLogout} onEditName={onEditName} showToast={showToast} color="indigo" />
      
      <div className="flex-1 p-6 space-y-6">
        
        {pendingPurchase && (
          <div className="bg-amber-100 rounded-3xl p-5 text-center border border-amber-200 flex items-center justify-between shadow-sm">
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
                      <div className="bg-orange-50 text-orange-500 p-2 rounded-xl"><StoreIcon size={18}/></div>
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

        {/* History Log */}
        <div className="pt-4 pb-10">
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="font-bold text-slate-800 text-sm">ประวัติล่าสุด</h3>
            <button onClick={handleReport} className="text-xs font-bold text-red-400 hover:text-red-600 flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg"><AlertTriangle size={12}/> รายงานปัญหา</button>
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-8 bg-white rounded-3xl border border-slate-100 shadow-sm">ยังไม่มีรายการทำธุรกรรม</p>
            ) : history.slice(0,5).map((h: any, idx: number) => (
              <div key={idx} className="bg-white p-5 rounded-[2rem] flex justify-between items-center border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${h.type === 'purchase' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
                    {h.type === 'purchase' ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">{h.type === 'purchase' ? 'ซื้อคูปอง' : 'ใช้คูปอง'}</p>
                    <p className="text-[10px] text-slate-400">{h.date.toLocaleDateString()} {h.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>
                <p className={`font-black text-lg ${h.type === 'purchase' ? 'text-indigo-600' : 'text-slate-800'}`}>
                  {h.type === 'purchase' ? `+${h.numSets * 5}` : `-${h.couponsUsed}`}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ==================== MERCHANT DASHBOARD ==================== */
function MerchantDashboardView({ user, userData, redemptions, merchantSales, merchantPayouts, systemSettings, onLogout, showToast, onEditName }: any) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${user?.uid}&margin=10`;

  const sysPrice = Number(systemSettings?.pricePerSet) || 79;
  const sysFee = Number(systemSettings?.platformFee) || 9;

  const togglePause = async () => {
    await updateDoc(doc(getFirestore(), 'users', user.uid), { isPaused: !userData?.isPaused });
    showToast(userData?.isPaused ? "เปิดรับออเดอร์แล้ว" : "ปิดรับออเดอร์ชั่วคราวแล้ว", "info");
  };

  const totalSetsSold = merchantSales.reduce((sum: number, p: PurchaseSlip) => sum + Number(p.numSets), 0);
  const totalUnpaidSets = merchantSales.filter((p: PurchaseSlip) => p.payoutStatus !== 'paid').reduce((sum: number, p: PurchaseSlip) => sum + Number(p.numSets), 0);
  const amountOwed = totalUnpaidSets * (sysPrice - sysFee);

  const downloadQR = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MFUPass_StoreQR_${userData?.storeName || 'Shop'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("ดาวน์โหลด QR Code แล้ว", "success");
    } catch (e) {
      window.open(qrCodeUrl, "_blank");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-full w-full bg-[#F9FAFB] relative">
      <Header title="Shop Center" subtitle={userData?.storeName || "Shop Console"} color="orange" onLogout={onLogout} user={user} userData={userData} showToast={showToast} onEditName={onEditName} />
      
      <div className="flex-1 p-6 space-y-6">
        {!userData?.isApproved ? (
           <Card className="text-center py-16 border-4 border-dashed border-orange-200 shadow-orange-100">
             <Clock className="mx-auto text-orange-400 mb-6 animate-pulse" size={64}/>
             <h3 className="text-2xl font-black text-slate-800 mb-2">รออนุมัติเปิดร้าน</h3>
             <p className="text-slate-500 text-sm px-4 leading-relaxed">แอดมินกำลังตรวจสอบข้อมูลร้านค้าของคุณ</p>
           </Card>
        ) : (
          <>
            <Card className="text-center p-8 shadow-orange-100/60 mb-6 border-none relative overflow-hidden">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-orange-100 rounded-full blur-3xl opacity-50"></div>
              <div className="w-full flex justify-between items-center mb-4 relative z-10">
                <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">พาสที่ขายได้ทั้งหมด</p>
                <button onClick={togglePause} className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1 ${userData.isPaused ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  <Power size={14}/> {userData.isPaused ? 'ร้านปิด (Pause)' : 'ร้านเปิด'}
                </button>
              </div>
              <div className="text-[6rem] font-black leading-none text-orange-500 mb-6 relative z-10">{totalSetsSold}</div>
              <div className="bg-orange-50 py-5 rounded-2xl border border-orange-100 shadow-inner relative z-10">
                <p className="text-orange-400 text-[10px] font-black uppercase tracking-widest mb-1">ยอดค้างจ่ายจากระบบ (รันออโต้)</p>
                <p className="text-4xl font-black text-orange-600">{amountOwed} <span className="text-xl">฿</span></p>
              </div>
            </Card>

            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-dashed border-orange-200 shadow-sm flex flex-col items-center text-center mb-8">
               <p className="text-slate-700 font-black text-lg mb-2">QR Code สำหรับรับสิทธิ์</p>
               <p className="text-slate-400 text-xs mb-6">ให้นักศึกษาสแกน QR นี้เพื่อใช้คูปองที่ร้านคุณ</p>
               <div className="bg-white p-4 rounded-3xl shadow-xl border border-slate-100 mb-6">
                 <img src={qrCodeUrl} className="w-48 h-48 object-contain rounded-xl" alt="Store QR" />
               </div>
               <button onClick={downloadQR} className="bg-orange-100 text-orange-600 font-bold py-3 px-8 rounded-full flex items-center gap-2 hover:bg-orange-200 active:scale-95 transition-all text-sm shadow-sm">
                 <Download size={18} /> ดาวน์โหลดภาพ QR Code
               </button>
            </div>

            <div className="pb-10">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">ประวัติการใช้คูปองวันนี้</h3>
              <div className="space-y-3">
                {redemptions.filter((r: Redemption) => new Date(r.redeemedAt).toDateString() === new Date().toDateString()).length === 0 ? (
                  <p className="text-slate-400 text-sm italic text-center py-4 bg-white rounded-2xl border border-slate-100">ยังไม่มีรายการวันนี้</p>
                ) : (
                  redemptions.filter((r: Redemption) => new Date(r.redeemedAt).toDateString() === new Date().toDateString()).map((r: Redemption, idx: number) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full text-green-600"><Ticket size={16}/></div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">ใช้คูปอง {r.couponsUsed} ใบ</p>
                          <p className="text-[10px] text-slate-400">{new Date(r.redeemedAt).toLocaleTimeString('th-TH')}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
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

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!file.type.startsWith('image/')) return showToast('กรุณาอัปโหลดรูปภาพเท่านั้น', 'error');
      compressImage(file, setSlip);
    }
  };

  const handleConfirm = async () => {
    if (!selectedMerchant) return showToast("กรุณาเลือกร้านค้าก่อน", "error");
    if (!slip) return showToast("กรุณาอัปโหลดสลิปยืนยัน", "error");
    setIsLoading(true);
    try {
      await addDoc(collection(getFirestore(), 'purchases'), {
        studentUid: user.uid,
        merchantId: selectedMerchant, // Feature 1
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
    <div className="flex flex-col h-full min-h-full w-full bg-white p-6 font-sans animate-in fade-in">
      <div className="flex items-center justify-between mb-6 pt-4 shrink-0">
        <button onClick={onBack} className="p-3 bg-slate-50 rounded-2xl text-slate-600 hover:bg-slate-100 active:scale-90"><ChevronLeft size={20}/></button>
        <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Buy Pass</h2>
        <div className="w-12"></div>
      </div>

      <div className="flex-1 space-y-5 pb-6">
        
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">1. เลือกร้านค้าที่จะใช้คูปอง</p>
          <select value={selectedMerchant} onChange={(e: any) => setSelectedMerchant(e.target.value)} className="w-full p-4 rounded-2xl border border-slate-200 outline-none font-bold text-slate-700">
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
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>

      <button onClick={handleConfirm} disabled={!slip || !selectedMerchant || isLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.5rem] text-lg mt-2 active:scale-95 disabled:opacity-50 shadow-xl shadow-indigo-200/50 shrink-0">
        {isLoading ? <Loader2 className="animate-spin mx-auto"/> : "ยืนยันส่งหลักฐาน"}
      </button>
    </div>
  );
}

/* ==================== SCAN QR VIEW ==================== */
function ScanQRView({ onBack, myPasses, myRedemptions, allUsers, user, onSuccess, showToast }: any) {
  const [selectedPassId, setSelectedPassId] = useState("");
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
    if (!selectedPassId) return showToast("กรุณาเลือกร้านค้าที่จะใช้พาสก่อน", "error");
    
    const cleanShopId = shopId.trim();
    if (!cleanShopId) return showToast("กรุณาระบุ Shop ID หรือ สแกน QR", "error");

    const targetPass = myPasses.find((p: Pass) => p.id === selectedPassId);
    if (!targetPass) return showToast("ไม่พบพาสของคุณ", "error");

    if (cleanShopId !== targetPass.merchantId) {
      return showToast("พาสนี้ไม่สามารถใช้กับร้านค้านี้ได้ กรุณาตรวจสอบให้ตรงกัน", "error");
    }

    if (targetPass.remainingCoupons < useCount) {
      return showToast("คูปองไม่เพียงพอ", "error");
    }

    // Cooldown Check
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

  const passesForSelection = myPasses.filter((p: Pass) => p.remainingCoupons >= useCount);

  return (
    <div className="flex flex-col h-full min-h-full w-full bg-slate-950 text-white p-6 font-sans relative">
      <div className="absolute top-8 left-6 z-10">
        <button onClick={onBack} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white active:scale-90"><ChevronLeft size={24}/></button>
      </div>

      <div className="w-full mt-16 animate-in slide-in-from-bottom-8 duration-500 overflow-y-auto pb-10">
        <h2 className="text-3xl font-black mb-6 italic tracking-tighter text-center text-indigo-400">Scan to Pay</h2>
        
        <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 mb-6 shadow-xl">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">1. เลือกร้านที่จะใช้คูปอง</p>
          <select value={selectedPassId} onChange={(e: any) => setSelectedPassId(e.target.value)} className="w-full bg-black/50 text-sm font-bold p-4 rounded-xl border border-slate-700 outline-none focus:border-indigo-500 text-indigo-300">
            <option value="">-- เลือกร้านค้า --</option>
            {passesForSelection.map((p: Pass) => {
              const storeName = allUsers.find((u: UserData) => u.uid === p.merchantId)?.storeName || 'Unknown Store';
              return <option key={p.id} value={p.id}>{storeName} (มี {p.remainingCoupons} ใบ)</option>
            })}
          </select>
        </div>

        <div className={`w-full aspect-square max-h-[300px] bg-black rounded-[3rem] relative overflow-hidden flex items-center justify-center border border-slate-800 shadow-2xl mb-6 ${isScanning ? 'border-indigo-500 shadow-[0_0_60px_rgba(99,102,241,0.3)]' : ''}`}>
          {isScanning ? (
            <div id="qr-reader" className="w-full h-full bg-black absolute inset-0"></div>
          ) : (
            <div className="text-center">
              <Camera size={60} className="text-slate-700 mx-auto mb-4" />
              <button onClick={() => setIsScanning(true)} disabled={!selectedPassId} className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-sm active:scale-95 flex items-center gap-2 mx-auto disabled:opacity-50">
                <ScanLine size={18} /> เปิดกล้องสแกน
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

        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl">
          <input type="text" placeholder="หรือพิมพ์ SHOP ID ที่นี่" value={shopId} onChange={(e: any) => setShopId(e.target.value)}
            className="w-full bg-black/50 text-center text-xl font-mono p-4 rounded-2xl outline-none focus:border-indigo-500 transition-all uppercase mb-4 border border-slate-800 text-indigo-300" />
          
          <div className="flex items-center justify-between bg-black/30 p-2 rounded-2xl mb-6 border border-slate-800">
             <span className="text-xs font-bold text-slate-400 pl-4">ใช้กี่คูปอง?:</span>
             <div className="flex bg-slate-800 rounded-xl">
               <button onClick={()=>setUseCount(1)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${useCount===1?'bg-indigo-600 text-white':'text-slate-400'}`}>1</button>
               <button onClick={()=>setUseCount(2)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${useCount===2?'bg-indigo-600 text-white':'text-slate-400'}`}>2</button>
             </div>
          </div>

          <button onClick={handleRedeem} disabled={!shopId || !selectedPassId || isProcessing} className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-lg active:scale-95 disabled:opacity-50">
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
    <div className="flex flex-col min-h-full h-full w-full bg-[#10b981] text-white items-center justify-center p-8 text-center animate-in fade-in duration-500 relative overflow-hidden">
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