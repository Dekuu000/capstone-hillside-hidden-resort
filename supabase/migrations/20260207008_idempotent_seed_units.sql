-- ============================================
-- Phase 3/4: Idempotent Unit Seeding
-- Created: 2026-02-07
-- Purpose: Prevent duplicate seed rows on re-run
-- ============================================

-- Seed data: insert only if a matching unit does not already exist.
-- Matching key: (name, type)
-- Rationale: name+type is a stable natural key for seed units and won't
-- create duplicates if base_price/capacity change later.

WITH seed_units AS (
  SELECT * FROM (VALUES
    ('Deluxe Room A', 'room', 'Spacious room with mountain view, air conditioning, and private bathroom', 2500.00, 2, ARRAY['AC', 'TV', 'WiFi', 'Private Bath']),
    ('Deluxe Room B', 'room', 'Cozy room with garden view and modern amenities', 2500.00, 2, ARRAY['AC', 'TV', 'WiFi', 'Private Bath']),
    ('Family Suite', 'room', 'Large suite perfect for families, with separate living area', 4500.00, 5, ARRAY['AC', 'TV', 'WiFi', 'Private Bath', 'Mini Kitchen']),
    ('Hillside Cottage 1', 'cottage', 'Private cottage with panoramic hillside views and outdoor terrace', 6000.00, 4, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Terrace', 'BBQ Grill']),
    ('Hillside Cottage 2', 'cottage', 'Rustic cottage surrounded by nature, perfect for a peaceful retreat', 5500.00, 4, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Terrace']),
    ('Poolside Cottage', 'cottage', 'Premium cottage with direct pool access and luxury amenities', 8000.00, 6, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Pool Access', 'BBQ Grill']),
    ('Swimming Pool', 'amenity', 'Olympic-size swimming pool with lounging area', 500.00, 20, ARRAY['Shower', 'Locker', 'Towels']),
    ('Function Hall', 'amenity', 'Versatile event space for meetings, parties, and celebrations', 15000.00, 100, ARRAY['AC', 'Sound System', 'Projector', 'Tables', 'Chairs']),
    ('Karaoke Room', 'amenity', 'Private karaoke room with premium sound system', 1000.00, 10, ARRAY['AC', 'Sound System', 'TV'])
  ) AS v(name, type, description, base_price, capacity, amenities)
)
INSERT INTO public.units (name, type, description, base_price, capacity, amenities)
SELECT s.name, s.type, s.description, s.base_price, s.capacity, s.amenities
FROM seed_units s
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u
  WHERE u.name = s.name AND u.type = s.type
);
