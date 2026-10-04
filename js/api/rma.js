import { supabase } from '../supabase.js';

export async function listRmaUnits() {
  const { data, error } = await supabase
    .from('part_instances')
    .select(`
      *,
      machine_slots (
        position,
        machine_parts (
          name,
          machines (id, code, team_id)
        )
      )
    `)
    .eq('rma_tagged', true)
    .order('rma_tagged_at', { ascending: false });

  if (error) throw error;

  return data.map(u => {
    let machineCode = null;
    let position = null;
    let partName = null;
    if (u.machine_slots && u.machine_slots.length > 0) {
      const slot = u.machine_slots[0];
      position = slot.position;
      if (slot.machine_parts) {
        partName = slot.machine_parts.name;
        if (slot.machine_parts.machines) {
          machineCode = slot.machine_parts.machines.code;
        }
      }
    }
    return {
      ...u,
      machine_code: machineCode,
      position: position,
      part_name: partName,
    };
  });
}
