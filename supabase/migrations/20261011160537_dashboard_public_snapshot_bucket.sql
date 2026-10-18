insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'fast-tracker-dashboard',
  'fast-tracker-dashboard',
  true,
  1048576,
  array['application/json']::text[]
)
on conflict (id) do nothing;
