"use client";
import React, { useEffect, useState, useRef } from "react";
import { 
  Ticket, User, Store, ShieldCheck, Loader2, Wallet, QrCode, 
  History, ArrowRight, Upload, CheckCircle, XCircle, Camera, 
  LogOut, Clock, ChevronLeft, Mail, Lock, UserPlus, LogIn,
  Users, Info, Sparkles, Image as ImageIcon, Settings, Save
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  Unsubscribe, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  signInWithCustomToken,
  signInAnonymously
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  increment, 
  serverTimestamp 
} from "firebase/firestore";

/**
 * ตำแหน่งไฟล์: app/page.tsx
 * เวอร์ชัน: 3.1 (Fixed Input Bug + Admin QR Config + iOS Design)
 */

// --- Admin Credentials (Hardcoded) ---
const ADMIN_EMAIL = "admin@mfupass.com";
const ADMIN_PASS = "mfupass1234";

// --- Firebase Initialization (Canvas Environment) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Helper for Firestore Paths (Rule 1)
const getPublicCollection = (name: string) => collection(getFirestore(), 'artifacts', appId, 'public', 'data', name);
const getPublicDoc = (col: string, id: string) => doc(getFirestore(), 'artifacts', appId, 'public', 'data', col, id);

// ============================================================================
// SUB-COMPONENTS (Moved outside App to fix Input/Focus Bug)
// ============================================================================

const Header = ({ title, subtitle, color = "indigo", onLogout }: any) => (
  <div className={`bg-${color}-600 text-white p-8 pt-12 rounded-b-[3rem] shadow-xl relative overflow-hidden mb-6`}>
    <div className="absolute -right-10 -top-10 opacity-10 rotate-12"><Ticket size={200}/></div>
    <div className="relative z-10 flex justify-between items-start">
      <div>
        <h2 className="text-3xl font-black italic tracking-tighter">{title}</h2>
        <p className={`text-${color}-100 text-[10px] font-bold uppercase tracking-widest mt-1`}>{subtitle}</p>
      </div>
      {onLogout && (
        <button onClick={onLogout} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all">
          <LogOut size={18} />
        </button>
      )}
    </div>
  </div>
);

const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-white p-6 ${className}`}>
    {children}
  </div>
);

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'role_setup'>('login');
  const [currentView, setCurrentView] = useState<'auth' | 'student' | 'merchant' | 'admin' | 'guest' | 'buy_pass' | 'scan_qr' | 'success'>('auth');
  
  // States
  const [userData, setUserData] = useState<any>(null);
  const [activePass, setActivePass] = useState<any>(null);
  const [pendingPurchase, setPendingPurchase] = useState<any>(null);
  const [allPendingSlips, setAllPendingSlips] = useState<any[]>([]);
  const [allPendingMerchants, setAllPendingMerchants] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>({ promptPayQr: null, price: 79 });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Auth Listener
  useEffect(() => {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const init = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    init();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && !currentUser.isAnonymous) {
        if (currentUser.email === ADMIN_EMAIL) {
          setCurrentView('admin');
        } else {
          const userSnap = await getDoc(getPublicDoc('users', currentUser.uid));
          if (userSnap.exists() && userSnap.data().role) {
            setUserData(userSnap.data());
            setCurrentView(userSnap.data().role);
          } else {
            setAuthMode('role_setup');
            setCurrentView('auth');
          }
        }
      } else {
        setCurrentView('auth');
        setAuthMode('login');
      }
      setIsAppReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Data Listeners (Rule 2: Fetch and filter in memory)
  useEffect(() => {
    if (!user || currentView === 'auth') return;
    const db = getFirestore();
    const unsubs: Unsubscribe[] = [];

    // System Settings Listener
    unsubs.push(onSnapshot(getPublicDoc('settings', 'global'), (snap) => {
      if (snap.exists()) setSystemSettings(snap.data());
    }, (err) => console.error(err)));

    if (['student', 'guest', 'buy_pass', 'scan_qr'].includes(currentView)) {
      unsubs.push(onSnapshot(getPublicCollection('passes'), (snap) => {
        const myPass = snap.docs.find(d => d.data().studentUid === user.uid && d.data().remainingCoupons > 0);
        setActivePass(myPass ? { id: myPass.id, ...myPass.data() } : null);
      }, (err) => console.error(err)));

      unsubs.push(onSnapshot(getPublicCollection('purchases'), (snap) => {
        const myPending = snap.docs.find(d => d.data().studentUid === user.uid && d.data().status === 'pending');
        setPendingPurchase(myPending ? { id: myPending.id, ...myPending.data() } : null);
      }, (err) => console.error(err)));
    }

    if (currentView === 'merchant') {
      unsubs.push(onSnapshot(getPublicCollection('redemptions'), (snap) => {
        const myReds = snap.docs.filter(d => d.data().merchantId === user.uid);
        setRedemptions(myReds.map(d => d.data()));
      }, (err) => console.error(err)));
      unsubs.push(onSnapshot(getPublicDoc('users', user.uid), (snap) => setUserData(snap.data()), (err) => console.error(err)));
    }

    if (currentView === 'admin') {
      unsubs.push(onSnapshot(getPublicCollection('purchases'), (snap) => {
        setAllPendingSlips(snap.docs.filter(d => d.data().status === 'pending').map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error(err)));
      unsubs.push(onSnapshot(getPublicCollection('users'), (snap) => {
        setAllPendingMerchants(snap.docs.filter(d => d.data().role === 'merchant' && d.data().isApproved === false).map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error(err)));
    }

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { unsubs.forEach(f => f()); clearInterval(timer); };
  }, [user, currentView]);

  // Handlers
  const handleAuth = async (emailInput: string, passInput: string) => {
    setIsActionLoading(true);
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(getAuth(), emailInput, passInput);
      } else {
        await signInWithEmailAndPassword(getAuth(), emailInput, passInput);
      }
    } catch (e: any) { alert(e.message); }
    setIsActionLoading(false);
  };

  const handleLogout = () => signOut(getAuth());

  // ============================================================================
  // RENDER LOGIC
  // ============================================================================

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl animate-bounce">
            <Ticket className="text-white" size={32} />
          </div>
          <p className="text-indigo-950 font-black text-xl tracking-tighter animate-pulse uppercase">MFU Pass</p>
        </div>
      </div>
    );
  }

  // --- Auth Screen (Externalized state to avoid jumps) ---
  if (currentView === 'auth') {
    return <AuthScreenView 
      authMode={authMode} 
      setAuthMode={setAuthMode} 
      onAuth={handleAuth} 
      onRoleSelect={async (role: string) => {
        setIsActionLoading(true);
        const data = { uid: user.uid, email: user.email, role, isApproved: role !== 'merchant', createdAt: serverTimestamp() };
        await setDoc(getPublicDoc('users', user.uid), data, { merge: true });
        setIsActionLoading(false);
      }}
      isActionLoading={isActionLoading}
    />;
  }

  // --- Admin Screen ---
  if (currentView === 'admin') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 font-sans overflow-y-auto pb-20">
        <div className="flex justify-between items-center mb-8 pt-4">
          <h2 className="text-3xl font-black text-indigo-400 italic">Admin Console</h2>
          <button onClick={handleLogout} className="bg-white/10 p-3 rounded-2xl"><LogOut size={20}/></button>
        </div>

        {/* Setting Section: QR Code */}
        <div className="mb-10">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Settings size={14}/> System Settings</h3>
          <Card className="bg-slate-800 border-slate-700 text-white">
            <p className="text-sm font-bold mb-4">PromptPay QR Code (Base64/URL)</p>
            <textarea 
              value={systemSettings.promptPayQr || ""} 
              onChange={(e) => setSystemSettings({...systemSettings, promptPayQr: e.target.value})}
              placeholder="วาง URL รูปภาพ หรือ Base64 ของคิวอาร์ที่นี่"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs font-mono mb-4 h-24 outline-none focus:border-indigo-500 transition-all"
            />
            <button 
              onClick={async () => {
                setIsActionLoading(true);
                await setDoc(getPublicDoc('settings', 'global'), systemSettings, { merge: true });
                setIsActionLoading(false);
                alert("บันทึกการตั้งค่าสำเร็จ");
              }}
              className="w-full bg-indigo-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <Save size={18}/> {isActionLoading ? 'Saving...' : 'Save QR Settings'}
            </button>
          </Card>
        </div>

        <div className="space-y-10">
          {/* Merchants Approvals */}
          <section>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">ร้านค้ารออนุมัติ ({allPendingMerchants.length})</h3>
            <div className="space-y-4">
              {allPendingMerchants.map(m => (
                <div key={m.id} className="bg-slate-800 p-5 rounded-3xl flex justify-between items-center border border-slate-700">
                  <div><p className="font-bold">{m.email}</p><p className="text-[10px] opacity-40">{m.id}</p></div>
                  <button onClick={() => updateDoc(getPublicDoc('users', m.id), { isApproved: true })} className="bg-green-500 px-4 py-2 rounded-xl font-bold text-xs">APPROVE</button>
                </div>
              ))}
            </div>
          </section>

          {/* Slip Approvals */}
          <section>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">สลิปรอตรวจสอบ ({allPendingSlips.length})</h3>
            <div className="space-y-6">
              {allPendingSlips.map(s => (
                <div key={s.id} className="bg-slate-800 p-6 rounded-[2rem] border border-slate-700">
                  <p className="text-[10px] font-mono text-slate-400 mb-4 truncate">UID: {s.studentUid}</p>
                  <img src={s.slipUrl} className="w-full rounded-2xl mb-6 aspect-[3/4] object-cover" alt="slip"/>
                  <div className="flex gap-4">
                    <button onClick={() => {
                      updateDoc(getPublicDoc('purchases', s.id), { status: 'approved' });
                      addDoc(getPublicCollection('passes'), { studentUid: s.studentUid, remainingCoupons: 5, createdAt: new Date().toISOString() });
                    }} className="flex-1 bg-green-500 py-4 rounded-xl font-black">APPROVE</button>
                    <button onClick={() => updateDoc(getPublicDoc('purchases', s.id), { status: 'rejected' })} className="flex-1 bg-red-600 py-4 rounded-xl font-black">REJECT</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // --- Student/Guest Dashboard ---
  if (currentView === 'student' || currentView === 'guest') {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-10">
        <Header title="My Wallet" subtitle={user?.email} onLogout={handleLogout} />
        <div className="px-6 -mt-10 flex-1 space-y-6 animate-in slide-in-from-bottom-6 duration-700">
          <Card className="text-center flex flex-col items-center">
            {activePass ? (
              <>
                <div className="flex justify-between w-full mb-6">
                  <div className="bg-indigo-50 p-4 rounded-3xl text-indigo-600"><Wallet size={24}/></div>
                  <span className="bg-green-100 text-green-600 px-4 py-1 rounded-full text-[10px] font-black uppercase">Active</span>
                </div>
                <p className="text-slate-400 font-black text-[10px] uppercase mb-1 tracking-widest">คูปองคงเหลือ</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-8xl font-black text-slate-900">{activePass.remainingCoupons}</span>
                  <span className="text-2xl text-slate-200 font-bold">/ 5</span>
                </div>
                <p className="text-green-500 font-black text-sm mb-8 flex items-center gap-2"><Sparkles size={16}/> มูลค่า {activePass.remainingCoupons * 20} บาท</p>
                <button onClick={() => setCurrentView('scan_qr')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                  <QrCode size={24}/> แสกนใช้ส่วนลด
                </button>
              </>
            ) : pendingPurchase ? (
              <div className="py-10">
                <Loader2 className="w-16 h-16 text-amber-500 animate-spin mx-auto mb-6" />
                <h3 className="text-2xl font-black text-slate-800 mb-2">รอแอดมินอนุมัติสลิป</h3>
                <p className="text-slate-400 text-sm">กำลังตรวจสอบความถูกต้องของการโอนเงิน</p>
              </div>
            ) : (
              <div className="py-8">
                <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-6"><Ticket size={48}/></div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">ยังไม่มีพาสใช้งาน</h3>
                <p className="text-slate-400 text-sm mb-8 px-4 leading-relaxed">ซื้อพาสส่วนลด 5 ใบ (มูลค่า 100 บาท) ในราคาเพียง 79 บาท</p>
                <button onClick={() => setCurrentView('buy_pass')} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all">
                  ซื้อพาสเลย (79.-)
                </button>
              </div>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col items-center gap-2 opacity-30 grayscale"><History size={24}/><p className="text-[10px] font-black">HISTORY</p></Card>
            <Card className="flex flex-col items-center gap-2 opacity-30 grayscale"><Info size={24}/><p className="text-[10px] font-black">GUIDE</p></Card>
          </div>
        </div>
      </div>
    );
  }

  // --- Buy Pass Screen ---
  if (currentView === 'buy_pass') {
    return <BuyPassView 
      settings={systemSettings} 
      onBack={() => setCurrentView('student' as any)} 
      onConfirm={async (slip: string) => {
        setIsActionLoading(true);
        await addDoc(getPublicCollection('purchases'), { studentUid: user.uid, slipUrl: slip, status: 'pending', createdAt: new Date().toISOString() });
        setIsActionLoading(false);
        setCurrentView('student' as any);
      }}
      isActionLoading={isActionLoading}
    />;
  }

  // --- Merchant Dashboard ---
  if (currentView === 'merchant') {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col font-sans pb-10">
        <Header title="Shop Center" subtitle={`ID: ${user?.uid.slice(0, 8)}`} color="orange" onLogout={handleLogout} />
        <div className="px-6 flex-1 space-y-6">
          {!userData?.isApproved ? (
            <Card className="text-center py-10 border-4 border-dashed border-orange-200">
              <Clock className="mx-auto text-orange-400 mb-4 animate-pulse" size={48}/>
              <h3 className="text-2xl font-black text-slate-800 mb-2">รอการอนุมัติร้านค้า</h3>
              <p className="text-slate-400 text-sm px-6">เจ้าหน้าที่กำลังตรวจสอบร้านค้าของคุณ โปรดรอการอนุมัติเพื่อเริ่มรับสิทธิ์</p>
            </Card>
          ) : (
            <>
              <Card className="text-center border-none shadow-orange-100/50">
                <p className="text-slate-400 font-black text-xs uppercase mb-2">รับคูปองแล้ววันนี้</p>
                <h2 className="text-8xl font-black text-orange-500 mb-4">{redemptions.length}</h2>
                <div className="bg-orange-600 text-white py-5 rounded-[2rem] shadow-lg">
                  <p className="text-orange-100 text-[10px] font-black mb-1 uppercase tracking-widest">ยอดเงินที่ต้องได้รับ</p>
                  <p className="text-4xl font-black">{redemptions.length * 20} ฿</p>
                </div>
              </Card>
              <Card className="bg-white border-2 border-dashed border-orange-100 text-center">
                <p className="text-slate-400 font-bold text-xs uppercase mb-3">รหัสร้านค้าของคุณ</p>
                <div className="bg-slate-50 p-4 rounded-xl font-mono text-[10px] break-all select-all text-orange-900 font-bold border border-orange-50">{user?.uid}</div>
              </Card>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Scan & Success Views ---
  if (currentView === 'scan_qr') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center">
        <h2 className="text-2xl font-black mb-10 tracking-tighter italic pt-8">REDEEM PASS</h2>
        <div className="w-full aspect-square border-4 border-indigo-500 rounded-[3rem] mb-12 relative flex items-center justify-center overflow-hidden">
          <Camera size={80} className="text-slate-800" />
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400 animate-bounce shadow-[0_0_20px_#6366f1]"></div>
        </div>
        <div className="w-full bg-slate-800 p-8 rounded-[2.5rem] border border-slate-700">
          <input 
            type="text" placeholder="PASTE SHOP ID" 
            autoFocus
            onKeyDown={async (e: any) => {
              if (e.key === 'Enter') {
                const val = e.target.value;
                if (val && activePass?.remainingCoupons > 0) {
                  await updateDoc(getPublicDoc('passes', activePass.id), { remainingCoupons: increment(-1) });
                  await addDoc(getPublicCollection('redemptions'), { studentUid: user.uid, merchantId: val, amount: 20, redeemedAt: new Date().toISOString() });
                  setCurrentView('success');
                }
              }
            }} 
            className="w-full bg-slate-900 p-5 rounded-2xl text-center font-mono text-indigo-300 border border-slate-700 outline-none focus:border-indigo-500 transition-all"
          />
          <p className="text-[10px] text-slate-500 text-center mt-4 font-bold tracking-widest uppercase">กด Enter เพื่อยืนยัน</p>
        </div>
        <button onClick={() => setCurrentView('student' as any)} className="mt-10 text-slate-500 font-bold uppercase text-xs">Cancel</button>
      </div>
    );
  }

  if (currentView === 'success') {
    return (
      <div className="min-h-screen bg-green-500 text-white p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-700">
        <div className="bg-white text-green-500 p-8 rounded-full mb-10 shadow-2xl animate-pop">
          <CheckCircle size={100}/>
        </div>
        <h1 className="text-6xl font-black mb-6 italic tracking-tighter">PAID</h1>
        <div className="bg-black/10 p-8 rounded-[3rem] backdrop-blur-md mb-12 w-full border border-white/20">
          <p className="text-[10px] uppercase font-black tracking-widest mb-2 opacity-60">Verified Coupon</p>
          <p className="text-6xl font-black">20 THB</p>
        </div>
        <p className="text-6xl font-mono font-black tracking-tighter mb-20">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
        <button onClick={() => setCurrentView('student' as any)} className="w-full bg-white text-green-600 font-black py-6 rounded-3xl text-2xl shadow-2xl active:scale-95 transition-all">DONE</button>
      </div>
    );
  }

  return null;
}

// ============================================================================
// VIEWS AS SEPARATE COMPONENTS (to prevent re-rendering bugs)
// ============================================================================

function AuthScreenView({ authMode, setAuthMode, onAuth, onRoleSelect, isActionLoading }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: any) => {
    e.preventDefault();
    onAuth(email, password);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[400px] animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-indigo-200 mb-4 rotate-3">
            <Ticket size={40} className="text-white" strokeWidth={2.5}/>
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter text-slate-900">MFU Pass</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">Digital Coupon System</p>
        </div>

        {authMode === 'role_setup' ? (
          <div className="space-y-4">
            <p className="text-center font-bold text-slate-500 mb-6 uppercase text-xs tracking-widest">เลือกบทบาทของคุณเพื่อเริ่มใช้งาน</p>
            <RoleButton icon={<User/>} title="นักศึกษา" onClick={() => onRoleSelect('student')} color="indigo" />
            <RoleButton icon={<Users/>} title="บุคคลทั่วไป" onClick={() => onRoleSelect('guest')} color="blue" />
            <RoleButton icon={<Store/>} title="ร้านค้า" onClick={() => onRoleSelect('merchant')} color="orange" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-200 overflow-hidden">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                <input 
                  type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full p-4 pl-12 outline-none font-bold text-slate-700 bg-transparent" required 
                />
              </div>
              <div className="h-[1px] bg-slate-100 mx-4"></div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                <input 
                  type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 pl-12 outline-none font-bold text-slate-700 bg-transparent" required 
                />
              </div>
            </div>
            <button disabled={isActionLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2">
              {isActionLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? <LogIn size={20}/> : <UserPlus size={20}/>)}
              {authMode === 'login' ? 'LOG IN' : 'SIGN UP'}
            </button>
            <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-4">
              {authMode === 'login' ? 'สมัครสมาชิกใหม่' : 'กลับไปหน้าล็อกอิน'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RoleButton({ icon, title, onClick, color }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white p-6 rounded-3xl flex items-center gap-6 border-2 border-transparent hover:border-indigo-600 transition-all shadow-sm group active:scale-95">
      <div className={`bg-${color}-50 p-4 rounded-2xl text-${color}-600 group-hover:bg-indigo-600 group-hover:text-white transition-all`}>{icon}</div>
      <div className="text-left font-black text-xl text-slate-800">{title}</div>
    </button>
  );
}

function BuyPassView({ settings, onBack, onConfirm, isActionLoading }: any) {
  const [slip, setSlip] = useState<string | null>(null);
  
  const handleFile = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const r = new FileReader();
      r.onloadend = () => setSlip(r.result as string);
      r.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 flex flex-col font-sans max-w-lg mx-auto w-full">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-slate-400 font-bold text-sm uppercase"><ChevronLeft size={18}/> Back</button>
      <h2 className="text-3xl font-black mb-8 italic tracking-tighter">Get Pass</h2>
      
      <Card className="text-center mb-6 border-indigo-100 border-2">
        <p className="text-indigo-600 font-black text-[10px] uppercase tracking-[0.2em] mb-4">โอนเงินเข้าบัญชี (79.00 THB)</p>
        <div className="bg-slate-50 aspect-square rounded-[2rem] mb-6 flex items-center justify-center border-4 border-dashed border-slate-100 overflow-hidden">
          {settings?.promptPayQr ? (
            <img src={settings.promptPayQr} className="w-full h-full object-contain" alt="QR" />
          ) : (
            <div className="text-center p-8 opacity-20"><QrCode size={100} className="mx-auto mb-2"/><p className="text-[10px] font-bold">ยังไม่ได้ตั้งค่าคิวอาร์</p></div>
          )}
        </div>
        <p className="text-slate-500 font-bold text-sm">PromptPay: MFU PASS ACCOUNT</p>
      </Card>

      <Card className="flex-1 flex flex-col">
        <p className="font-black text-slate-800 mb-4">อัปโหลดสลิปยืนยัน</p>
        <label className="flex-1 border-4 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 overflow-hidden relative transition-all">
          {slip ? <img src={slip} className="w-full h-full object-cover" alt="slip"/> : <div className="text-center"><Upload className="text-slate-200 mx-auto mb-2" size={48}/><p className="text-slate-300 text-[10px] font-black uppercase">เลือกรูปสลิปจากเครื่อง</p></div>}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </Card>
      <button onClick={() => onConfirm(slip)} disabled={!slip || isActionLoading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl mt-8 disabled:opacity-30 active:scale-95 transition-all">
        {isActionLoading ? <Loader2 className="animate-spin mx-auto"/> : 'ยืนยันและส่งสลิป'}
      </button>
    </div>
  );
}