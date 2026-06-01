-- Ensure pax-priced units have non-zero base rates.
-- Evergreen Pavilion: includes up to 30 pax at base rate, then per-pax add-on applies in app logic.
-- Pinecrest Exclusive: includes up to 20 pax at base rate, then per-pax add-on applies in app logic.

UPDATE public.units
SET base_price = 8500.00,
    description = 'Pavilion for 30-50 guests. Base rate includes up to 30 pax; additional pax charges apply.'
WHERE unit_code = 'AMN-EVERGREEN-PAVILION';

UPDATE public.units
SET base_price = 12000.00,
    description = 'Exclusive whole-resort booking. Base rate includes up to 20 pax; additional pax charges apply.'
WHERE unit_code = 'AMN-PINECREST-EXCLUSIVE';
