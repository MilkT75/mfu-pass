"use client";
import { Ticket, User, Store, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const handleRoleSelection = (role: string) => {
    // โค้ดส่วนนี้เดี๋ยวเราจะเชื่อม Firebase Auth ในอนาคต
    // ตอนนี้ให้กดแล้วเปลี่ยนหน้าไปตาม Role ก่อน
    router.push(`/${role}`);
  };

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden p-6 flex flex-col items-center">
        
        <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
          <Ticket size={32} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">MFU Pass</h1>
        <p className="text-gray-500 mb-10 text-center">เลือกบทบาทของคุณเพื่อเข้าสู่ระบบ</p>

        <div className="w-full space-y-4">
          <button onClick={() => handleRoleSelection('student')} className="w-full bg-white border-2 border-indigo-100 hover:border-indigo-600 p-4 rounded-xl flex items-center gap-4 transition-all">
            <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600"><User /></div>
            <div className="text-left">
              <h3 className="font-bold text-gray-800">Student</h3>
              <p className="text-xs text-gray-500">นักศึกษา - ซื้อและใช้คูปอง</p>
            </div>
          </button>

          <button onClick={() => handleRoleSelection('merchant')} className="w-full bg-white border-2 border-orange-100 hover:border-orange-500 p-4 rounded-xl flex items-center gap-4 transition-all">
            <div className="bg-orange-100 p-3 rounded-lg text-orange-600"><Store /></div>
            <div className="text-left">
              <h3 className="font-bold text-gray-800">Merchant</h3>
              <p className="text-xs text-gray-500">ร้านค้า - รับแสกนคูปอง</p>
            </div>
          </button>

          <button onClick={() => handleRoleSelection('admin')} className="w-full bg-white border-2 border-slate-100 hover:border-slate-800 p-4 rounded-xl flex items-center gap-4 transition-all">
            <div className="bg-slate-100 p-3 rounded-lg text-slate-800"><ShieldCheck /></div>
            <div className="text-left">
              <h3 className="font-bold text-gray-800">Admin</h3>
              <p className="text-xs text-gray-500">ผู้ดูแล - อนุมัติสลิปโอนเงิน</p>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}