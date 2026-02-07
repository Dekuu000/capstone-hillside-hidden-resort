import { z } from 'zod';

export const unitSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    type: z.enum(['room', 'cottage', 'amenity'], {
        message: 'Please select a unit type',
    }),
    description: z.string().optional(),
    base_price: z.number().min(0, 'Price must be a positive number'),
    capacity: z.number().int().min(1, 'Capacity must be at least 1'),
    is_active: z.boolean(),
    image_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    amenities: z.array(z.string()),
});

export type UnitFormData = z.infer<typeof unitSchema>;

// Common amenities for quick selection
export const COMMON_AMENITIES = [
    'AC',
    'TV',
    'WiFi',
    'Private Bath',
    'Kitchen',
    'Mini Kitchen',
    'Terrace',
    'BBQ Grill',
    'Pool Access',
    'Shower',
    'Locker',
    'Towels',
    'Sound System',
    'Projector',
    'Tables',
    'Chairs',
];
