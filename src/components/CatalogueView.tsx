import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  Search,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import { BookingRequest, Resource, ResourceCategory, ResourceStatus, ResourceType } from '../types';
import { ResilientImage } from './ResilientImage';

interface CatalogueViewProps {
  resources: Resource[];
  bookings: BookingRequest[];
  onSelectResource: (resource: Resource) => void;
}

const CATEGORIES: ('All' | ResourceCategory)[] = [
  'All',
  'Electronics & Coding Kits',
  'Computers & Laptops',
  '3D Printing & Making',
  'Science & Physics Labs',
  'Project Rooms & Spaces',
];

const RESOURCE_TYPES: ('All' | ResourceType)[] = [
  'All',
  'Kit',
  'Equipment',
  'Workstation',
  'Laboratory Space',
  'Room',
];

const STATUS_FILTERS: ('All' | ResourceStatus)[] = [
  'All',
  'Available',
  'In Use',
  'Maintenance',
];

export const CatalogueView: React.FC<CatalogueViewProps> = ({
  resources,
  bookings,
  onSelectResource,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ResourceCategory>('All');
  const [selectedType, setSelectedType] = useState<'All' | ResourceType>('All');
  const [selectedStatus, setSelectedStatus] = useState<'All' | ResourceStatus>('All');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('All');

  const buildings = useMemo(() => {
    const unique = Array.from(new Set(resources.map((r) => r.building)));
    return ['All', ...unique];
  }, [resources]);

  const filteredResources = useMemo(() => {
    return resources.filter((res) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        res.name.toLowerCase().includes(q) ||
        res.code.toLowerCase().includes(q) ||
        res.description.toLowerCase().includes(q) ||
        res.location.toLowerCase().includes(q) ||
        res.category.toLowerCase().includes(q);

      const matchesCategory = selectedCategory === 'All' || res.category === selectedCategory;
      const matchesType = selectedType === 'All' || res.resourceType === selectedType;
      const matchesStatus = selectedStatus === 'All' || res.status === selectedStatus;
      const matchesBuilding = selectedBuilding === 'All' || res.building === selectedBuilding;

      return matchesSearch && matchesCategory && matchesType && matchesStatus && matchesBuilding;
    });
  }, [resources, searchQuery, selectedCategory, selectedType, selectedStatus, selectedBuilding]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedType('All');
    setSelectedStatus('All');
    setSelectedBuilding('All');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs font-mono text-teal-700 font-semibold">
            SHARED EQUIPMENT &amp; SPACES · SCHOOL &amp; COLLEGE DIRECTORY
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Browse Shared Resources</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Find shared Arduino kits, computer lab slots, 3D printers, science tools, and project rooms. Click any item to check available time slots and submit a quick booking request.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 tabular-nums shrink-0">
          Showing {filteredResources.length} of {resources.length} items
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for Arduino kit, computer lab, 3D printer, multimeter..."
              aria-label="Search resources by name or keyword"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          {/* Resource Type Dropdown */}
          <div className="md:col-span-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'All' | ResourceType)}
              aria-label="Filter by resource type"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'All' ? 'All Resource Types' : t}
                </option>
              ))}
            </select>
          </div>

          {/* Building / Location Dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              aria-label="Filter by building location"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b === 'All' ? 'All Campus Locations' : b}
                </option>
              ))}
            </select>
          </div>

          {/* Availability Filter Dropdown */}
          <div className="md:col-span-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'All' | ResourceStatus)}
              aria-label="Filter by availability status"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'All'
                    ? 'All Statuses'
                    : s === 'Available'
                    ? 'Ready to Book'
                    : s === 'In Use'
                    ? 'Currently in Use'
                    : 'Maintenance'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Segmented Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Category filters">
            <span className="text-xs font-medium text-slate-500 mr-1 inline-flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Category:
            </span>
            {CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {(searchQuery ||
            selectedCategory !== 'All' ||
            selectedType !== 'All' ||
            selectedStatus !== 'All' ||
            selectedBuilding !== 'All') && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 underline whitespace-nowrap shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Resource Cards Grid */}
      {filteredResources.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
          <SlidersHorizontal className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">No matching resources found</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Try clearing filters or searching for something else like "Arduino" or "Computer".
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResources.map((resource) => {
            const activeBookingsCount = bookings.filter(
              (b) =>
                b.resourceId === resource.id &&
                (b.status === 'Approved' || b.status === 'CheckedIn')
            ).length;

            return (
              <article
                key={resource.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="aspect-4/3 w-full bg-slate-100 border-b border-slate-200 overflow-hidden">
                    <ResilientImage
                      src={resource.imageUrl}
                      alt={resource.name}
                      code={resource.code}
                      category={resource.category}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="p-5 space-y-3">
                    {/* Unboxed metadata line */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="font-semibold text-slate-900">{resource.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>{resource.resourceType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">Sample Resource</span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 font-sans font-semibold ${
                          resource.status === 'Available'
                            ? 'text-emerald-700'
                            : resource.status === 'In Use'
                            ? 'text-teal-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {resource.status === 'Available' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : resource.status === 'In Use' ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5" />
                        )}
                        {resource.status === 'Available'
                          ? 'Ready to Book'
                          : resource.status === 'In Use'
                          ? 'In Use'
                          : 'Maintenance'}
                      </span>
                    </div>

                    {/* Resource Title */}
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {resource.name}
                    </h2>

                    <div className="text-xs text-slate-500">{resource.category}</div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {resource.description}
                    </p>

                    {/* Location & Hours */}
                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{resource.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Hours: {resource.operatingHours} · Max {resource.maxDurationHours}h per booking
                        </span>
                      </div>
                    </div>

                    {/* Eligibility & Condition Summary */}
                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      <div>
                        <span className="font-semibold text-slate-800">Who Can Use:</span>{' '}
                        {resource.requiredSafetyModule}
                      </div>
                      <div className="text-slate-500 line-clamp-1">
                        <span className="font-semibold text-slate-700">Condition:</span>{' '}
                        {resource.conditionSummary}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer CTA */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-slate-600 tabular-nums">
                    {activeBookingsCount} booked session{activeBookingsCount === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectResource(resource)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Check &amp; Book
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
