-- QA-01: every stored timezone must be readable by PostgreSQL *and* Node.
-- 1. Old IANA aliases → current names (same rules, different spelling).
UPDATE "users" SET "timezone" = CASE "timezone"
  WHEN 'Africa/Asmera' THEN 'Africa/Asmara'
  WHEN 'America/Buenos_Aires' THEN 'America/Argentina/Buenos_Aires'
  WHEN 'America/Catamarca' THEN 'America/Argentina/Catamarca'
  WHEN 'America/Cordoba' THEN 'America/Argentina/Cordoba'
  WHEN 'America/Godthab' THEN 'America/Nuuk'
  WHEN 'America/Indianapolis' THEN 'America/Indiana/Indianapolis'
  WHEN 'America/Jujuy' THEN 'America/Argentina/Jujuy'
  WHEN 'America/Louisville' THEN 'America/Kentucky/Louisville'
  WHEN 'America/Mendoza' THEN 'America/Argentina/Mendoza'
  WHEN 'Asia/Calcutta' THEN 'Asia/Kolkata'
  WHEN 'Asia/Katmandu' THEN 'Asia/Kathmandu'
  WHEN 'Asia/Rangoon' THEN 'Asia/Yangon'
  WHEN 'Asia/Saigon' THEN 'Asia/Ho_Chi_Minh'
  WHEN 'Atlantic/Faeroe' THEN 'Atlantic/Faroe'
  WHEN 'Europe/Kiev' THEN 'Europe/Kyiv'
  WHEN 'Pacific/Enderbury' THEN 'Pacific/Kanton'
  WHEN 'Pacific/Ponape' THEN 'Pacific/Pohnpei'
  WHEN 'Pacific/Truk' THEN 'Pacific/Chuuk'
  ELSE "timezone" END
WHERE "timezone" IN ('Africa/Asmera', 'America/Buenos_Aires', 'America/Catamarca',
  'America/Cordoba', 'America/Godthab', 'America/Indianapolis', 'America/Jujuy',
  'America/Louisville', 'America/Mendoza', 'Asia/Calcutta', 'Asia/Katmandu', 'Asia/Rangoon',
  'Asia/Saigon', 'Atlantic/Faeroe', 'Europe/Kiev', 'Pacific/Enderbury', 'Pacific/Ponape',
  'Pacific/Truk');

-- 2. Anything else this database cannot read (removed names, raw offsets) →
--    the app's default timezone. The user can choose again in Settings.
UPDATE "users" SET "timezone" = 'Asia/Phnom_Penh'
WHERE "timezone" NOT IN (SELECT "name" FROM pg_timezone_names);
