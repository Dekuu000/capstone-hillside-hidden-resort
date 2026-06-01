-- ============================================
-- Update unit catalog to new resort lineup
-- Created: 2026-05-28
-- Purpose:
-- 1) Align units with latest business lineup
-- 2) Keep historical reservations intact (no hard delete)
-- 3) Soft-deactivate old units not in the new lineup
-- ============================================

WITH desired_units AS (
  SELECT * FROM (VALUES
    -- Cottages
    (
      'COT-RIDGE-NEST',
      'Ridge Nest',
      NULL::text,
      'cottage',
      'Small cottage for 4-6 guests.',
      500.00::numeric,
      6::int,
      ARRAY['Fan', 'Private CR', 'Seating Area']::text[],
      true::boolean,
      'cleaned'::text
    ),
    (
      'COT-PEACE-HAVEN',
      'Peace Haven',
      NULL::text,
      'cottage',
      'Medium cottage for 6-9 guests.',
      800.00::numeric,
      9::int,
      ARRAY['Fan', 'Private CR', 'Seating Area']::text[],
      true::boolean,
      'cleaned'::text
    ),
    (
      'COT-CALMSTONE',
      'Calmstone Cabin',
      NULL::text,
      'cottage',
      'Large cottage for 10-15 guests.',
      1000.00::numeric,
      15::int,
      ARRAY['Fan', 'Private CR', 'Extended Seating Area']::text[],
      true::boolean,
      'cleaned'::text
    ),

    -- Rooms (3 available units)
    (
      'ROM-LUXE-HIDEAWAY-1',
      'Luxe Hideaway 1',
      'LH-1',
      'room',
      'Luxe Hideaway unit (4-5 guests).',
      3500.00::numeric,
      5::int,
      ARRAY['AC', 'TV', 'WiFi', 'Private Bath']::text[],
      true::boolean,
      'cleaned'::text
    ),
    (
      'ROM-LUXE-HIDEAWAY-2',
      'Luxe Hideaway 2',
      'LH-2',
      'room',
      'Luxe Hideaway unit (4-5 guests).',
      3500.00::numeric,
      5::int,
      ARRAY['AC', 'TV', 'WiFi', 'Private Bath']::text[],
      true::boolean,
      'cleaned'::text
    ),
    (
      'ROM-LUXE-HIDEAWAY-3',
      'Luxe Hideaway 3',
      'LH-3',
      'room',
      'Luxe Hideaway unit (4-5 guests).',
      3500.00::numeric,
      5::int,
      ARRAY['AC', 'TV', 'WiFi', 'Private Bath']::text[],
      true::boolean,
      'cleaned'::text
    ),

    -- Pavilion (price depends on pax)
    (
      'AMN-EVERGREEN-PAVILION',
      'Evergreen Pavilion',
      NULL::text,
      'amenity',
      'Pavilion for 30-50 guests. Price depends on pax.',
      8500.00::numeric,
      50::int,
      ARRAY['Open Hall', 'Stage Area', 'Seats/Tables']::text[],
      true::boolean,
      'cleaned'::text
    ),

    -- Exclusive booking
    (
      'AMN-PINECREST-EXCLUSIVE',
      'Pinecrest Exclusive',
      NULL::text,
      'amenity',
      'Exclusive whole-resort booking. Price depends on pax and group requirements.',
      12000.00::numeric,
      50::int,
      ARRAY['Exclusive Access', 'Custom Setup']::text[],
      true::boolean,
      'cleaned'::text
    )
  ) AS v(
    unit_code,
    name,
    room_number,
    type,
    description,
    base_price,
    capacity,
    amenities,
    is_active,
    operational_status
  )
)
INSERT INTO public.units (
  unit_code,
  name,
  room_number,
  type,
  description,
  base_price,
  capacity,
  amenities,
  is_active,
  operational_status
)
SELECT
  d.unit_code,
  d.name,
  d.room_number,
  d.type,
  d.description,
  d.base_price,
  d.capacity,
  d.amenities,
  d.is_active,
  d.operational_status
FROM desired_units d
ON CONFLICT (unit_code) DO UPDATE
SET
  name = EXCLUDED.name,
  room_number = EXCLUDED.room_number,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price,
  capacity = EXCLUDED.capacity,
  amenities = EXCLUDED.amenities,
  is_active = EXCLUDED.is_active,
  operational_status = EXCLUDED.operational_status,
  updated_at = NOW();

-- Soft-deactivate units not part of the updated lineup.
-- This preserves historical reservation links while keeping the
-- current inventory list clean.
UPDATE public.units u
SET
  is_active = false,
  operational_status = 'maintenance',
  updated_at = NOW()
WHERE u.unit_code NOT IN (
  'COT-RIDGE-NEST',
  'COT-PEACE-HAVEN',
  'COT-CALMSTONE',
  'ROM-LUXE-HIDEAWAY-1',
  'ROM-LUXE-HIDEAWAY-2',
  'ROM-LUXE-HIDEAWAY-3',
  'AMN-EVERGREEN-PAVILION',
  'AMN-PINECREST-EXCLUSIVE'
);
