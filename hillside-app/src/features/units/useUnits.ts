import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Unit } from '../../types/database';

// Fetch all units (admin sees all, guests see only active)
export function useUnits(type?: 'room' | 'cottage' | 'amenity') {
    return useQuery({
        queryKey: ['units', type],
        queryFn: async () => {
            let query = supabase.from('units').select('*').order('created_at', { ascending: false });

            if (type) {
                query = query.eq('type', type);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as Unit[];
        },
    });
}

// Fetch single unit by ID
export function useUnit(unitId: string | undefined) {
    return useQuery({
        queryKey: ['units', unitId],
        queryFn: async () => {
            if (!unitId) return null;
            const { data, error } = await supabase
                .from('units')
                .select('*')
                .eq('unit_id', unitId)
                .single();
            if (error) throw error;
            return data as Unit;
        },
        enabled: !!unitId,
    });
}

// Create new unit
export function useCreateUnit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (unit: Omit<Unit, 'unit_id' | 'created_at' | 'updated_at'>) => {
            const { data, error } = await supabase
                .from('units')
                .insert(unit)
                .select()
                .single();
            if (error) throw error;
            return data as Unit;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
        },
    });
}

// Update existing unit
export function useUpdateUnit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ unitId, updates }: { unitId: string; updates: Partial<Unit> }) => {
            const { data, error } = await supabase
                .from('units')
                .update(updates)
                .eq('unit_id', unitId)
                .select()
                .single();
            if (error) throw error;
            return data as Unit;
        },
        onSuccess: (_, { unitId }) => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
            queryClient.invalidateQueries({ queryKey: ['units', unitId] });
        },
    });
}

// Delete unit (soft delete by setting is_active = false)
export function useDeleteUnit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (unitId: string) => {
            const { error } = await supabase
                .from('units')
                .update({ is_active: false })
                .eq('unit_id', unitId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
        },
    });
}

// Toggle unit active status
export function useToggleUnitStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ unitId, isActive }: { unitId: string; isActive: boolean }) => {
            const { error } = await supabase
                .from('units')
                .update({ is_active: isActive })
                .eq('unit_id', unitId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
        },
    });
}
