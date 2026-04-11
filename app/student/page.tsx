"use client";
import { useRouter } from "next/navigation";

export default function StudentPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-4">หน้าต่างนักศึกษา (Student)</h1>
      <p>เดี๋ยวเราจะใส่ระบบซื้อพาสและแสกนคูปองที่นี่</p>
      <button onClick={() => router.push('/')} className="mt-6 bg-indigo-600 text-white px-4 py-2 rounded-xl">กลับหน้าหลัก</button>
    </div>
  );
}