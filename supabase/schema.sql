create extension if not exists vector;

create table if not exists document_chunks (
  id text primary key,
  document_id text not null,
  document_name text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);

alter table document_chunks enable row level security; /*rls message*/

create index if not exists document_chunks_document_id_idx
  on document_chunks (document_id);

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
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where source_ids is null
     or document_chunks.document_id = any(source_ids)
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
