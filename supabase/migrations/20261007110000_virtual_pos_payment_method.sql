-- Keep the future online-card method distinct from historical physical POS.
-- Customer creation remains blocked by the following foundation migration.
alter type public.payment_method add value if not exists 'virtual_pos';
