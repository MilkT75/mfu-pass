"use client";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-2xl font-bold mb-4 text-slate-800">หน้าต่างผู้ดูแลระบบ (Admin)</h1>
      <p>เดี๋ยวเราจะใส่ระบบอนุมัติสลิปที่นี่</p>
      <button onClick={() => router.push('/')} className="mt-6 bg-slate-800 text-white px-4 py-2 rounded-xl">กลับหน้าหลัก</button>
    </div>
  );
}