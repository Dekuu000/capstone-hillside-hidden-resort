import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Unit } from '../../types/database';
import {
    createUnit,
    fetchUnit,
    fetchUnits,
    softDeleteUnit,
    toggleUnitStatus,
    updateUnit,
} from '../../services/unitsService';

// Fetch all units (admin sees all, guests see only active)
export function useUnits(type?: 'room' | 'cottage' | 'amenity') {
    return useQuery({
        queryKey: ['units', type],
        queryFn: async () => {
            return await fetchUnits(type);
        },
    });
}

// Fetch single unit by ID
export function useUnit(unitId: string | undefined) {
    return useQuery({
        queryKey: ['units', unitId],
        queryFn: async () => {
            if (!unitId) return null;
            return await fetchUnit(unitId);
        },
        enabled: !!unitId,
    });
}

// Create new unit
export function useCreateUnit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (unit: Omit<Unit, 'unit_id' | 'created_at' | 'updated_at'>) => {
            return await createUnit(unit);
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
            return await updateUnit(unitId, updates);
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
            await softDeleteUnit(unitId);
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
            await toggleUnitStatus(unitId, isActive);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
        },
    });
}
