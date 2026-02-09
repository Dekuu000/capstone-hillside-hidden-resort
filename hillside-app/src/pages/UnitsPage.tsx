import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout';
import { useUnits, useToggleUnitStatus, useDeleteUnit } from '../features/units/useUnits';
import {
    Plus,
    Search,
    Building2,
    Home,
    Sparkles,
    Edit,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Loader2,
    AlertCircle
} from 'lucide-react';
import type { Unit } from '../types/database';
import { formatPeso } from '../lib/formatting';

type FilterType = 'all' | 'room' | 'cottage' | 'amenity';

export function UnitsPage() {
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    const { data: units, isLoading, error } = useUnits(filter === 'all' ? undefined : filter);
    const toggleStatus = useToggleUnitStatus();
    const deleteUnit = useDeleteUnit();

    // Filter units based on search and active status
    const filteredUnits = units?.filter(unit => {
        const matchesSearch = unit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            unit.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesActive = showInactive || unit.is_active;
        return matchesSearch && matchesActive;
    }) || [];

    function getTypeIcon(type: string) {
        switch (type) {
            case 'room': return <Building2 className="w-5 h-5" />;
            case 'cottage': return <Home className="w-5 h-5" />;
            case 'amenity': return <Sparkles className="w-5 h-5" />;
            default: return <Building2 className="w-5 h-5" />;
        }
    }

    function getTypeBadgeColor(type: string) {
        switch (type) {
            case 'room': return 'bg-blue-100 text-blue-700';
            case 'cottage': return 'bg-green-100 text-green-700';
            case 'amenity': return 'bg-purple-100 text-purple-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    }

    function handleToggleStatus(unit: Unit) {
        toggleStatus.mutate({ unitId: unit.unit_id, isActive: !unit.is_active });
    }

    function handleDelete(unitId: string) {
        if (confirm('Are you sure you want to deactivate this unit?')) {
            deleteUnit.mutate(unitId);
        }
    }

    return (
        <AdminLayout>
            <div>
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Units Management</h1>
                        <p className="text-gray-600 mt-1">Manage rooms, cottages, and amenities</p>
                    </div>
                    <Link to="/admin/units/new" className="btn-primary inline-flex items-center justify-center">
                        <Plus className="w-5 h-5 mr-2" />
                        Add Unit
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-md p-4 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search units..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input w-full pl-10"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'room', 'cottage', 'amenity'] as FilterType[]).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilter(type)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${filter === type
                                            ? 'bg-primary text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Show Inactive Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-gray-600">Show inactive</span>
                        </label>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
                        <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                        <div>
                            <h3 className="font-semibold text-red-800">Failed to load units</h3>
                            <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && filteredUnits.length === 0 && (
                    <div className="bg-white rounded-xl shadow-md p-12 text-center">
                        <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No units found</h3>
                        <p className="text-gray-600 mb-6">
                            {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first unit'}
                        </p>
                        {!searchQuery && (
                            <Link to="/admin/units/new" className="btn-primary inline-flex items-center">
                                <Plus className="w-5 h-5 mr-2" />
                                Add Unit
                            </Link>
                        )}
                    </div>
                )}

                {/* Units Grid */}
                {!isLoading && !error && filteredUnits.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredUnits.map(unit => (
                            <div
                                key={unit.unit_id}
                                className={`bg-white rounded-xl shadow-md overflow-hidden ${!unit.is_active ? 'opacity-60' : ''
                                    }`}
                            >
                                {/* Image/Placeholder */}
                                <div className="h-40 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                                    {unit.image_url ? (
                                        <img
                                            src={unit.image_url}
                                            alt={unit.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="text-primary/30">
                                            {getTypeIcon(unit.type)}
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-lg text-gray-900">{unit.name}</h3>
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTypeBadgeColor(unit.type)}`}>
                                                {getTypeIcon(unit.type)}
                                                {unit.type}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-cta">{formatPeso(unit.base_price)}</p>
                                            <p className="text-xs text-gray-500">per night</p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                        {unit.description || 'No description'}
                                    </p>

                                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                                        <span>Capacity: {unit.capacity}</span>
                                        <span className={unit.is_active ? 'text-green-600' : 'text-red-600'}>
                                            {unit.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    {/* Amenities */}
                                    {unit.amenities && unit.amenities.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-4">
                                            {unit.amenities.slice(0, 4).map(amenity => (
                                                <span key={amenity} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                                    {amenity}
                                                </span>
                                            ))}
                                            {unit.amenities.length > 4 && (
                                                <span className="px-2 py-0.5 text-xs text-gray-500">
                                                    +{unit.amenities.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                                        <Link
                                            to={`/admin/units/${unit.unit_id}/edit`}
                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors"
                                        >
                                            <Edit className="w-4 h-4" />
                                            Edit
                                        </Link>
                                        <button
                                            onClick={() => handleToggleStatus(unit)}
                                            className={`p-2 rounded-lg transition-colors cursor-pointer ${unit.is_active
                                                    ? 'text-gray-600 hover:bg-gray-100'
                                                    : 'text-green-600 hover:bg-green-50'
                                                }`}
                                            title={unit.is_active ? 'Deactivate' : 'Activate'}
                                        >
                                            {unit.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(unit.unit_id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

