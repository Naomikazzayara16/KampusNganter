import type { Metadata } from "next";
import { createSessionClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Pesan" };

export default async function NewOrderPage() {
  await requireUser("/pesan");
  const supabase = await createSessionClient();
  const { data: zones } = await supabase.from("zones").select("id, name").order("id");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Pesan</h1>
      <OrderForm zones={(zones ?? []) as { id: number; name: string }[]} />
    </div>
  );
}
