"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { setAvailability } from "@/server/actions/driver";
import type { ActionState } from "@/server/result";

export function AvailabilityForm({
  online,
  zones,
  currentZone,
}: {
  online: boolean;
  zones: { id: number; name: string }[];
  currentZone: number | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(setAvailability, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="online" value={online ? "off" : "on"} />
      {!online && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="zoneId" className="label">
              Zona
            </label>
            <select id="zoneId" name="zoneId" className="input" defaultValue={currentZone ?? zones[0]?.id}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hours" className="label">
              Selama
            </label>
            <select id="hours" name="hours" className="input" defaultValue={2}>
              {[1, 2, 3, 4].map((h) => (
                <option key={h} value={h}>
                  {h} jam
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {online && <input type="hidden" name="zoneId" value={currentZone ?? zones[0]?.id ?? 1} />}
      <FormMessage state={state} />
      <SubmitButton className={online ? "btn-secondary w-full" : "btn w-full"}>
        {online ? "Matikan (OFF)" : "Nyalakan (ON)"}
      </SubmitButton>
    </form>
  );
}
