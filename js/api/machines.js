import { supabase } from '../supabase.js';

export async function listMachines() {
  const { data, error } = await supabase
    .from('machines')
    .select(`
      *,
      machine_types (id, name),
      teams (id, name),
      machine_parts (
        id, module, serialized, quantity,
        machine_slots (id, instance_id, part_instances (id, rma_tagged))
      )
    `)
    .order('code');
  if (error) throw error;

  return data.map(m => {
    let totalSlots = 0;
    let installedSlots = 0;
    let rmaCount = 0;

    (m.machine_parts || []).forEach(p => {
      (p.machine_slots || []).forEach(s => {
        totalSlots++;
        if (s.instance_id) installedSlots++;
        if (s.part_instances && s.part_instances.rma_tagged) rmaCount++;
      });
    });

    return {
      ...m,
      type_name: m.machine_types ? m.machine_types.name : 'Unknown',
      team_name: m.teams ? m.teams.name : 'Unassigned',
      total_slots: totalSlots,
      installed_slots: installedSlots,
      rma_count: rmaCount,
    };
  });
}

export async function getMachineByCode(code) {
  const { data, error } = await supabase
    .from('machines')
    .select(`
      *,
      machine_types (id, name),
      teams (id, name),
      machine_parts (
        *,
        machine_slots (
          *,
          part_instances (*)
        )
      )
    `)
    .eq('code', code.trim().toUpperCase())
    .single();

  if (error) throw error;

  data.type_name = data.machine_types ? data.machine_types.name : 'Unknown';
  data.team_name = data.teams ? data.teams.name : 'Unassigned';

  // Sort parts and slots logically
  if (data.machine_parts) {
    data.machine_parts.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    data.machine_parts.forEach(p => {
      if (p.machine_slots) {
        p.machine_slots.sort((a, b) => a.position - b.position);
      }
    });
  }

  return data;
}

export async function createMachine({ code, machineTypeId, teamId, location }) {
  const { data, error } = await supabase.rpc('create_machine', {
    p_code: code.trim().toUpperCase(),
    p_type_id: machineTypeId,
    p_team_id: teamId,
    p_location: location ? location.trim() : null,
  });

  if (error) throw error;
  return data;
}

export async function updateMachine(id, { status, location, teamId }) {
  const { error } = await supabase.rpc('update_machine', {
    p_machine_id: id,
    p_status: status || null,
    p_location: location !== undefined ? (location ? location.trim() : null) : null,
    p_team_id: teamId || null,
  });

  if (error) throw error;
}

export async function deleteMachine(id) {
  const { error } = await supabase.rpc('delete_machine', {
    p_machine_id: id,
  });

  if (error) throw error;
}

export async function listMachineTypes() {
  const { data, error } = await supabase
    .from('machine_types')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createMachineType(name) {
  const { data, error } = await supabase
    .from('machine_types')
    .insert([{ name: name.trim() }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listTypeTemplates(machineTypeId) {
  const { data, error } = await supabase
    .from('part_definitions')
    .select('*')
    .eq('machine_type_id', machineTypeId)
    .eq('active', true)
    .order('module')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createTypeTemplate(def) {
  const { data, error } = await supabase
    .from('part_definitions')
    .insert([{
      machine_type_id: def.machineTypeId,
      module: def.module,
      name: def.name.trim(),
      part_number: def.partNumber.trim().toUpperCase(),
      serialized: !!def.serialized,
      quantity: parseInt(def.quantity, 10) || 1,
      placement_mode: def.placementMode || 'flexible',
      rma_applicable: !!def.rmaApplicable,
      description: def.description ? def.description.trim() : null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTypeTemplate(id, def) {
  const { data, error } = await supabase
    .from('part_definitions')
    .update({
      name: def.name.trim(),
      part_number: def.partNumber.trim().toUpperCase(),
      serialized: !!def.serialized,
      quantity: parseInt(def.quantity, 10) || 1,
      placement_mode: def.placementMode || 'flexible',
      rma_applicable: !!def.rmaApplicable,
      description: def.description ? def.description.trim() : null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTypeTemplate(id) {
  const { error } = await supabase
    .from('part_definitions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
