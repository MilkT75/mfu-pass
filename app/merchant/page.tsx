"use client";
import { useRouter } from "next/navigation";

export default function MerchantPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <h1 className="text-2xl font-bold mb-4 text-orange-900">หน้าต่างร้านค้า (Merchant)</h1>
      <p>เดี๋ยวเราจะใส่ระบบดูยอดแสกนที่นี่</p>
      <button onClick={() => router.push('/')} className="mt-6 bg-orange-600 text-white px-4 py-2 rounded-xl">กลับหน้าหลัก</button>
    </div>
  );
}