import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export async function audit(
  actorId: string,
  action: string,
  target: { type: string; id: string },
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const { error } = await createServiceClient()
    .from("audit_log")
    .insert({ actor_id: actorId, action, target_type: target.type, target_id: target.id, metadata });
  if (error) {
    // Akses dokumen tanpa jejak audit tidak boleh lolos diam-diam.
    throw new Error(`Gagal mencatat audit: ${error.message}`);
  }
}
