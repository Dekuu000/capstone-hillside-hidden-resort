-- Create units table for rooms, cottages, and amenities
CREATE TABLE IF NOT EXISTS public.units (
  unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('room', 'cottage', 'amenity')),
  description TEXT,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active units (for guests browsing)
CREATE POLICY "anyone_can_read_active_units" ON public.units
  FOR SELECT
  USING (is_active = true);

-- Policy: Authenticated users can read all units (for admin)
CREATE POLICY "authenticated_can_read_all_units" ON public.units
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can insert units
CREATE POLICY "authenticated_can_insert_units" ON public.units
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Authenticated users can update units
CREATE POLICY "authenticated_can_update_units" ON public.units
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can delete units
CREATE POLICY "authenticated_can_delete_units" ON public.units
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_units_type ON public.units(type);
CREATE INDEX IF NOT EXISTS idx_units_active ON public.units(is_active);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed data: Sample units
INSERT INTO public.units (name, type, description, base_price, capacity, amenities) VALUES
  ('Deluxe Room A', 'room', 'Spacious room with mountain view, air conditioning, and private bathroom', 2500.00, 2, ARRAY['AC', 'TV', 'WiFi', 'Private Bath']),
  ('Deluxe Room B', 'room', 'Cozy room with garden view and modern amenities', 2500.00, 2, ARRAY['AC', 'TV', 'WiFi', 'Private Bath']),
  ('Family Suite', 'room', 'Large suite perfect for families, with separate living area', 4500.00, 5, ARRAY['AC', 'TV', 'WiFi', 'Private Bath', 'Mini Kitchen']),
  ('Hillside Cottage 1', 'cottage', 'Private cottage with panoramic hillside views and outdoor terrace', 6000.00, 4, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Terrace', 'BBQ Grill']),
  ('Hillside Cottage 2', 'cottage', 'Rustic cottage surrounded by nature, perfect for a peaceful retreat', 5500.00, 4, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Terrace']),
  ('Poolside Cottage', 'cottage', 'Premium cottage with direct pool access and luxury amenities', 8000.00, 6, ARRAY['AC', 'TV', 'WiFi', 'Kitchen', 'Pool Access', 'BBQ Grill']),
  ('Swimming Pool', 'amenity', 'Olympic-size swimming pool with lounging area', 500.00, 20, ARRAY['Shower', 'Locker', 'Towels']),
  ('Function Hall', 'amenity', 'Versatile event space for meetings, parties, and celebrations', 15000.00, 100, ARRAY['AC', 'Sound System', 'Projector', 'Tables', 'Chairs']),
  ('Karaoke Room', 'amenity', 'Private karaoke room with premium sound system', 1000.00, 10, ARRAY['AC', 'Sound System', 'TV']);
