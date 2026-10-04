import { supabase } from '../supabase.js';

export async function addPartToMachine({
  machineId,
  machineTypeId,
  module,
  name,
  partNumber,
  serialized,
  quantity,
  placementMode,
  rmaApplicable,
}) {
  const cleanPn = partNumber.trim().toUpperCase();

  // Check if already in type template
  let templateExisted = false;
  if (machineTypeId) {
    const { data: existingDef } = await supabase
      .from('part_definitions')
      .select('id')
      .eq('machine_type_id', machineTypeId)
      .eq('module', module)
      .eq('part_number', cleanPn)
      .maybeSingle();

    if (existingDef) templateExisted = true;
  }

  const { data, error } = await supabase.rpc('add_part_to_machine', {
    p_machine_id: machineId,
    p_module: module,
    p_name: name.trim(),
    p_part_number: cleanPn,
    p_serialized: !!serialized,
    p_quantity: parseInt(quantity, 10) || 1,
    p_placement: placementMode || 'flexible',
    p_rma_applicable: !!rmaApplicable,
    p_add_to_template: true, // Automatically sync to type template
  });

  if (error) throw error;
  return { machinePartId: data, templateExisted };
}

export async function setSlotSerial({ slotId, serial, rma = false, notes = null }) {
  const { data, error } = await supabase.rpc('set_slot_serial', {
    p_slot_id: slotId,
    p_serial: serial.trim().toUpperCase(),
    p_rma: !!rma,
    p_notes: notes ? notes.trim() : null,
  });
  if (error) throw error;
  return data;
}

export async function updateSlotInstance({ instanceId, serialNumber, notes }) {
  const { error } = await supabase.rpc('update_unit_details', {
    p_instance_id: instanceId,
    p_serial_number: serialNumber ? serialNumber.trim().toUpperCase() : null,
    p_notes: notes !== undefined ? (notes ? notes.trim() : null) : null,
  });
  if (error) throw error;
}

export async function replaceSerializedPart({ slotId, outcome, newSerial = null, reason = null, notes = null }) {
  const { error } = await supabase.rpc('replace_serialized_part', {
    p_slot_id: slotId,
    p_outcome: outcome,
    p_new_serial: newSerial ? newSerial.trim().toUpperCase() : null,
    p_reason: reason ? reason.trim() : null,
    p_notes: notes ? notes.trim() : null,
  });
  if (error) throw error;
}

export async function replaceNonSerializedPart({ machinePartId, reason = null, notes = null }) {
  const { error } = await supabase.rpc('replace_non_serialized_part', {
    p_machine_part_id: machinePartId,
    p_reason: reason ? reason.trim() : null,
    p_notes: notes ? notes.trim() : null,
  });
  if (error) throw error;
}

export async function swapParts({ slotA, slotB, notes = null }) {
  const { error } = await supabase.rpc('swap_parts', {
    p_slot_a: slotA,
    p_slot_b: slotB,
    p_notes: notes ? notes.trim() : null,
  });
  if (error) throw error;
}

export async function setRmaTag({ instanceId, tagged, note = null }) {
  const { error } = await supabase.rpc('set_rma_tag', {
    p_instance_id: instanceId,
    p_tagged: !!tagged,
    p_note: note ? note.trim() : null,
  });
  if (error) throw error;
}
