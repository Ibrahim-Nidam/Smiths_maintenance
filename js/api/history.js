import { supabase } from '../supabase.js';

export async function listMaintenanceEvents({ machineId = null, limit = 50 } = {}) {
  let query = supabase
    .from('maintenance_events')
    .select(`
      *,
      machines (code),
      profiles (full_name),
      old_instance:part_instances!old_instance_id (serial_number),
      new_instance:part_instances!new_instance_id (serial_number),
      machine_parts (name, module)
    `)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (machineId) query = query.eq('machine_id', machineId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
