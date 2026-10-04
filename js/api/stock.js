import { supabase } from '../supabase.js';

export async function listStockItems(kind = null) {
  let query = supabase.from('stock_items').select('*').order('name');
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listSerializedUnits() {
  const { data, error } = await supabase
    .from('part_instances')
    .select(`
      *,
      machine_slots (
        position,
        machine_parts (
          name,
          machines (code)
        )
      )
    `)
    .order('part_number')
    .order('serial_number');

  if (error) throw error;

  return data.map(u => {
    let machineCode = null;
    let position = null;
    if (u.machine_slots && u.machine_slots.length > 0) {
      const slot = u.machine_slots[0];
      position = slot.position;
      if (slot.machine_parts && slot.machine_parts.machines) {
        machineCode = slot.machine_parts.machines.code;
      }
    }
    return {
      ...u,
      machine_code: machineCode,
      position: position,
    };
  });
}

export async function createStockItem({ kind, name, partNumber, unit = 'pcs', minQuantity = 0, location = null, initialQuantity = 0 }) {
  const { data, error } = await supabase.rpc('create_stock_item', {
    p_kind: kind,
    p_name: name.trim(),
    p_part_number: partNumber ? partNumber.trim().toUpperCase() : null,
    p_unit: unit || 'pcs',
    p_min: parseFloat(minQuantity) || 0,
    p_location: location ? location.trim() : null,
    p_initial: parseFloat(initialQuantity) || 0,
  });
  if (error) throw error;
  return data;
}

export async function adjustStock({ itemId, delta, reason }) {
  const { error } = await supabase.rpc('adjust_stock', {
    p_item_id: itemId,
    p_delta: parseFloat(delta),
    p_reason: reason ? reason.trim() : null,
  });
  if (error) throw error;
}

export async function addSerializedUnitToStock({ partNumber, serialNumber, notes, location }) {
  const { data, error } = await supabase.rpc('add_serialized_unit_to_stock', {
    p_part_number: partNumber.trim().toUpperCase(),
    p_serial: serialNumber.trim().toUpperCase(),
    p_notes: notes ? notes.trim() : null,
    p_location: location ? location.trim() : 'stock',
  });
  if (error) throw error;
  return data;
}

export async function listStockMovements() {
  const { data, error } = await supabase
    .from('stock_movements')
    .select(`
      *,
      stock_items (name, part_number),
      part_instances (part_number, serial_number),
      profiles (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data;
}
