import { supabase } from '../supabase.js';

// Parts catalogue (part number + designation). The table is seeded from
// docs/Unique_Parts_PN_list.xlsx by sql/011_parts_catalog.sql.
//
// The whole active catalogue is small reference data, so it is fetched once and
// kept in a module-level cache: searching then happens in memory and stays instant.

let cachePromise = null;

export function invalidateCatalog() {
  cachePromise = null;
}

// True when the catalogue table has not been created yet (migration 011 not run).
export function isCatalogMissing(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01' || /parts_catalog/.test(message) && /does not exist|schema cache/i.test(message);
}

export async function fetchCatalog() {
  if (!cachePromise) {
    cachePromise = supabase
      .from('parts_catalog')
      .select('id, part_number, designation, module, serialized, machine_type_ids, active, updated_at')
      .eq('active', true)
      .order('part_number')
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      });
    cachePromise.catch(() => { cachePromise = null; });
  }
  return cachePromise;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

// Case-insensitive match on part number or designation.
export function filterCatalog(parts, query, limit = 0) {
  const term = normalize(query);
  if (!term) return limit ? parts.slice(0, limit) : parts;
  const hits = parts.filter(p =>
    normalize(p.part_number).includes(term) || normalize(p.designation).includes(term)
  );
  return limit ? hits.slice(0, limit) : hits;
}

// Used by the part picker: never throws, returns [] when the catalogue is unavailable.
export async function searchCatalogParts(query, limit = 8) {
  try {
    return filterCatalog(await fetchCatalog(), query, limit);
  } catch {
    return [];
  }
}

// Stock and template usage per part number, for the parts page filters.
export async function fetchCatalogContext() {
  const [stockRes, defRes] = await Promise.all([
    supabase.from('stock_items')
      .select('part_number, name, quantity, unit, kind, location, min_quantity')
      .eq('active', true)
      .not('part_number', 'is', null),
    supabase.from('part_definitions')
      .select('part_number')
      .eq('active', true),
  ]);
  if (stockRes.error) throw stockRes.error;
  if (defRes.error) throw defRes.error;

  const stockByPart = {};
  (stockRes.data || []).forEach(item => {
    const key = String(item.part_number).toUpperCase();
    if (!stockByPart[key]) stockByPart[key] = [];
    stockByPart[key].push(item);
  });

  const templatesByPart = {};
  (defRes.data || []).forEach(def => {
    const key = String(def.part_number).toUpperCase();
    templatesByPart[key] = (templatesByPart[key] || 0) + 1;
  });

  return { stockByPart, templatesByPart };
}

// module: 'input' | 'scanner' | 'output' | null (not classified yet).
// serialized: true | false | null (not classified yet).
// machineTypeIds: uuid[] of the machine types the part is used in (empty = any).
export async function saveCatalogPart({
  partId = null,
  partNumber,
  designation,
  module = null,
  serialized = null,
  machineTypeIds = [],
}) {
  const { data, error } = await supabase.rpc('save_catalog_part', {
    p_part_number: String(partNumber || '').trim().toUpperCase(),
    p_designation: String(designation || '').trim(),
    p_part_id: partId,
    p_module: module || null,
    p_serialized: serialized === undefined ? null : serialized,
    p_machine_type_ids: machineTypeIds || [],
  });
  if (error) throw error;
  invalidateCatalog();
  return data;
}

export async function deleteCatalogPart(partId) {
  const { error } = await supabase.rpc('delete_catalog_part', { p_part_id: partId });
  if (error) throw error;
  invalidateCatalog();
}
