import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout';
import { useUnit, useCreateUnit, useUpdateUnit } from '../features/units/useUnits';
import { unitSchema, COMMON_AMENITIES, type UnitFormData } from '../features/units/schemas';
import {
    Save,
    ArrowLeft,
    Loader2,
    AlertCircle,
    CheckCircle,
    X
} from 'lucide-react';

export function UnitFormPage() {
    const { unitId } = useParams<{ unitId: string }>();
    const isEditing = Boolean(unitId);
    const navigate = useNavigate();

    const { data: unit, isLoading: loadingUnit } = useUnit(unitId);
    const createUnit = useCreateUnit();
    const updateUnit = useUpdateUnit();

    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<UnitFormData>({
        resolver: zodResolver(unitSchema),
        defaultValues: {
            name: '',
            type: 'room',
            description: '',
            base_price: 0,
            capacity: 2,
            is_active: true,
            image_url: '',
            amenities: [],
        },
    });

    // Populate form when editing
    useEffect(() => {
        if (unit && isEditing) {
            reset({
                name: unit.name,
                type: unit.type as 'room' | 'cottage' | 'amenity',
                description: unit.description || '',
                base_price: unit.base_price,
                capacity: unit.capacity,
                is_active: unit.is_active,
                image_url: unit.image_url || '',
                amenities: unit.amenities || [],
            });
        }
    }, [unit, isEditing, reset]);

    const selectedAmenities = watch('amenities') || [];

    function toggleAmenity(amenity: string) {
        const current = selectedAmenities;
        if (current.includes(amenity)) {
            setValue('amenities', current.filter(a => a !== amenity));
        } else {
            setValue('amenities', [...current, amenity]);
        }
    }

    async function onSubmit(data: UnitFormData) {
        try {
            setError(null);
            setSuccess(false);

            if (isEditing && unitId) {
                await updateUnit.mutateAsync({ unitId, updates: data });
            } else {
                await createUnit.mutateAsync(data);
            }

            setSuccess(true);
            setTimeout(() => navigate('/admin/units'), 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save unit');
        }
    }

    if (loadingUnit && isEditing) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => navigate('/admin/units')}
                        className="flex items-center text-gray-600 hover:text-primary mb-4 cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5 mr-2" />
                        Back to Units
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">
                        {isEditing ? 'Edit Unit' : 'Add New Unit'}
                    </h1>
                </div>

                {/* Success Alert */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start" role="alert">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-green-800">
                                Unit {isEditing ? 'updated' : 'created'} successfully!
                            </p>
                            <p className="text-sm text-green-700 mt-1">Redirecting...</p>
                        </div>
                    </div>
                )}

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start" role="alert">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-md p-6 space-y-6">
                    {/* Name */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                            Unit Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            {...register('name')}
                            type="text"
                            id="name"
                            className={`input w-full ${errors.name ? 'input-error' : ''}`}
                            placeholder="e.g., Deluxe Room A"
                        />
                        {errors.name && (
                            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                        )}
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Type <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {(['room', 'cottage', 'amenity'] as const).map(type => (
                                <label key={type} className="flex items-center cursor-pointer">
                                    <input
                                        {...register('type')}
                                        type="radio"
                                        value={type}
                                        className="w-4 h-4 text-primary focus:ring-primary"
                                    />
                                    <span className="ml-2 font-medium capitalize">{type}</span>
                                </label>
                            ))}
                        </div>
                        {errors.type && (
                            <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                        </label>
                        <textarea
                            {...register('description')}
                            id="description"
                            rows={3}
                            className="input w-full"
                            placeholder="Describe this unit..."
                        />
                    </div>

                    {/* Base Price & Capacity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="base_price" className="block text-sm font-medium text-gray-700 mb-2">
                                Base Price (₱) <span className="text-red-500">*</span>
                            </label>
                            <Controller
                                name="base_price"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        id="base_price"
                                        min="0"
                                        step="0.01"
                                        className={`input w-full ${errors.base_price ? 'input-error' : ''}`}
                                        placeholder="0.00"
                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                    />
                                )}
                            />
                            {errors.base_price && (
                                <p className="mt-1 text-sm text-red-600">{errors.base_price.message}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 mb-2">
                                Capacity <span className="text-red-500">*</span>
                            </label>
                            <Controller
                                name="capacity"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        id="capacity"
                                        min="1"
                                        className={`input w-full ${errors.capacity ? 'input-error' : ''}`}
                                        placeholder="2"
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                    />
                                )}
                            />
                            {errors.capacity && (
                                <p className="mt-1 text-sm text-red-600">{errors.capacity.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Image URL */}
                    <div>
                        <label htmlFor="image_url" className="block text-sm font-medium text-gray-700 mb-2">
                            Image URL
                        </label>
                        <input
                            {...register('image_url')}
                            type="url"
                            id="image_url"
                            className={`input w-full ${errors.image_url ? 'input-error' : ''}`}
                            placeholder="https://example.com/image.jpg"
                        />
                        {errors.image_url && (
                            <p className="mt-1 text-sm text-red-600">{errors.image_url.message}</p>
                        )}
                    </div>

                    {/* Amenities */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Amenities
                        </label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {COMMON_AMENITIES.map(amenity => (
                                <button
                                    key={amenity}
                                    type="button"
                                    onClick={() => toggleAmenity(amenity)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${selectedAmenities.includes(amenity)
                                            ? 'bg-primary text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {amenity}
                                    {selectedAmenities.includes(amenity) && (
                                        <X className="w-3 h-3 ml-1 inline" />
                                    )}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">
                            Selected: {selectedAmenities.length > 0 ? selectedAmenities.join(', ') : 'None'}
                        </p>
                    </div>

                    {/* Active Status */}
                    <div className="flex items-center gap-3">
                        <input
                            {...register('is_active')}
                            type="checkbox"
                            id="is_active"
                            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="is_active" className="text-sm font-medium text-gray-700 cursor-pointer">
                            Unit is active and available for booking
                        </label>
                    </div>

                    {/* Submit */}
                    <div className="flex gap-4 pt-4 border-t border-gray-200">
                        <button
                            type="submit"
                            disabled={isSubmitting || success}
                            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5 mr-2" />
                                    {isEditing ? 'Update Unit' : 'Create Unit'}
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/admin/units')}
                            className="btn-secondary"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </AdminLayout>
    );
}
