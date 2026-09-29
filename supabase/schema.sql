create extension if not exists vector;

create table if not exists document_chunks (
  id text primary key,
  document_id text not null,
  document_name text not null,
  chunk_index integer not null,
  content text not null,
  source_url text,
  video_id text,
  speaker text,
  start_ms integer,
  end_ms integer,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);

alter table document_chunks add column if not exists source_url text;
alter table document_chunks add column if not exists video_id text;
alter table document_chunks add column if not exists speaker text;
alter table document_chunks add column if not exists start_ms integer;
alter table document_chunks add column if not exists end_ms integer;
alter table document_chunks add column if not exists content_hash text;

alter table document_chunks enable row level security; /*rls message*/

create index if not exists document_chunks_document_id_idx
  on document_chunks (document_id);

create index if not exists document_chunks_content_hash_idx
  on document_chunks (content_hash);

create table if not exists demo_rate_limits (
  bucket_start timestamptz not null,
  scope text not null,
  key_hash text not null,
  request_count integer not null default 0,
  primary key (bucket_start, scope, key_hash)
);

alter table demo_rate_limits enable row level security;

create or replace function consume_demo_rate_limit(
  p_scope text,
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
as $$
declare
  v_bucket_start timestamptz;
  is_allowed boolean;
begin
  if p_max_requests <= 0 or p_window_seconds <= 0 then
    raise exception 'Rate-limit parameters must be positive';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into demo_rate_limits (bucket_start, scope, key_hash, request_count)
  values (v_bucket_start, p_scope, p_key_hash, 1)
  on conflict (bucket_start, scope, key_hash) do update
    set request_count = demo_rate_limits.request_count + 1
    where demo_rate_limits.request_count < p_max_requests
  returning true into is_allowed;

  return coalesce(is_allowed, false);
end;
$$;

drop function if exists match_document_chunks(vector, integer, text[]);

create or replace function match_document_chunks(
  query_embedding vector(3072),
  match_count integer,
  source_ids text[] default null
)
returns table (
  id text,
  document_id text,
  document_name text,
  chunk_index integer,
  content text,
  source_url text,
  video_id text,
  speaker text,
  start_ms integer,
  end_ms integer,
  similarity float
)
language sql
stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.document_name,
    document_chunks.chunk_index,
    document_chunks.content,
    document_chunks.source_url,
    document_chunks.video_id,
    document_chunks.speaker,
    document_chunks.start_ms,
    document_chunks.end_ms,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where source_ids is null
     or document_chunks.document_id = any(source_ids)
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
