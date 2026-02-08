import { supabase } from '../lib/supabase';
import type { Unit } from '../types/database';

export async function fetchUnits(type?: 'room' | 'cottage' | 'amenity') {
    let query = supabase.from('units').select('*').order('created_at', { ascending: false });

    if (type) {
        query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Unit[];
}

export async function fetchUnit(unitId: string) {
    const { data, error } = await supabase
        .from('units')
        .select('*')
        .eq('unit_id', unitId)
        .single();
    if (error) throw error;
    return data as Unit;
}

export async function createUnit(unit: Omit<Unit, 'unit_id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
        .from('units')
        .insert(unit)
        .select()
        .single();
    if (error) throw error;
    return data as Unit;
}

export async function updateUnit(unitId: string, updates: Partial<Unit>) {
    const { data, error } = await supabase
        .from('units')
        .update(updates)
        .eq('unit_id', unitId)
        .select()
        .single();
    if (error) throw error;
    return data as Unit;
}

export async function softDeleteUnit(unitId: string) {
    const { error } = await supabase
        .from('units')
        .update({ is_active: false })
        .eq('unit_id', unitId);
    if (error) throw error;
}

export async function toggleUnitStatus(unitId: string, isActive: boolean) {
    const { error } = await supabase
        .from('units')
        .update({ is_active: isActive })
        .eq('unit_id', unitId);
    if (error) throw error;
}
