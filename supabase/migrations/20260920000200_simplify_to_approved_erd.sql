-- Simplify the prototype database to the five entities in the supervisor-approved ERD.
-- JWT/session policy, announcements, result formatting, signing-key management,
-- and administrative audit history stay in application code/configuration for now.

drop schema if exists audit cascade;
drop schema if exists ballot_box cascade;
drop schema if exists election cascade;
drop schema if exists identity cascade;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  university_id varchar(20) not null unique,
  full_name varchar(100) not null,
  email varchar(100) not null,
  password_hash varchar(255) not null,
  photo_url text not null,
  department varchar(50) not null,
  class_year integer not null,
  club_memberships text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_email_unique unique (email),
  constraint students_class_year_check check (class_year between 1 and 8)
);

create unique index students_email_unique_ci on public.students (lower(email));
create unique index students_university_id_unique_ci on public.students (lower(university_id));

create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  title varchar(150) not null,
  description text,
  scope_type varchar(20) not null,
  scope_target varchar(100),
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ballots_scope_type_check check (
    scope_type in ('GLOBAL', 'DEPARTMENTAL', 'SENIOR', 'CLUB', 'COMBINED')
  ),
  constraint ballots_scope_target_check check (
    (scope_type = 'GLOBAL' and scope_target is null)
    or (scope_type <> 'GLOBAL' and scope_target is not null and btrim(scope_target) <> '')
  ),
  constraint ballots_time_check check (start_time < end_time)
);

create index ballots_voting_window_idx on public.ballots (start_time, end_time);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  candidacy_statement text not null,
  manifesto_text text not null,
  nomination_status varchar(20) not null default 'PENDING',
  rejection_reason text,
  ai_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_ballot_id_id_unique unique (ballot_id, id),
  constraint candidates_student_ballot_unique unique (ballot_id, student_id),
  constraint candidates_status_check check (
    nomination_status in ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
  ),
  constraint candidates_statement_length_check check (
    char_length(btrim(candidacy_statement)) between 20 and 500
  ),
  constraint candidates_manifesto_length_check check (
    char_length(btrim(manifesto_text)) between 100 and 10000
  ),
  constraint candidates_rejection_reason_check check (
    nomination_status <> 'REJECTED'
    or (rejection_reason is not null and btrim(rejection_reason) <> '')
  ),
  constraint candidates_ai_summary_check check (
    ai_summary is null
    or (jsonb_typeof(ai_summary) = 'array' and jsonb_array_length(ai_summary) = 3)
  )
);

create index candidates_ballot_status_idx
  on public.candidates (ballot_id, nomination_status, created_at);

create table public.voter_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  ballot_id uuid not null references public.ballots(id) on delete cascade,
  voted_at timestamptz not null default now(),
  blinded_request_digest char(64) not null,
  idempotency_key_digest char(64) not null,
  constraint voter_logs_student_ballot_unique unique (student_id, ballot_id),
  constraint voter_logs_blinded_digest_check check (
    blinded_request_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint voter_logs_idempotency_digest_check check (
    idempotency_key_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint voter_logs_ballot_idempotency_unique unique (ballot_id, idempotency_key_digest)
);

comment on table public.voter_logs is
  'Identity-side participation only. It has no candidate ID, receipt hash, or spent-token digest.';

create table public.vote_hashes (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots(id) on delete restrict,
  candidate_id uuid not null,
  token_digest char(64) not null unique,
  receipt_hash char(64) not null unique,
  time_taken_seconds integer not null,
  anomaly_score numeric(5,4) not null,
  is_quarantined boolean not null default false,
  created_at timestamptz not null default now(),
  constraint vote_hashes_candidate_ballot_fk
    foreign key (ballot_id, candidate_id)
    references public.candidates(ballot_id, id)
    on delete restrict,
  constraint vote_hashes_token_digest_check check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint vote_hashes_receipt_hash_check check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint vote_hashes_time_taken_check check (time_taken_seconds >= 0),
  constraint vote_hashes_anomaly_score_check check (anomaly_score between 0 and 1)
);

create index vote_hashes_ballot_candidate_idx
  on public.vote_hashes (ballot_id, candidate_id);
create index vote_hashes_ballot_quarantine_idx
  on public.vote_hashes (ballot_id, is_quarantined);

comment on table public.vote_hashes is
  'Anonymous vote storage. It must never contain student IDs, JWTs, cookies, IP addresses, user-agent strings, session IDs, or voter-log IDs.';

create or replace function public.cast_anonymous_vote(
  p_ballot_id uuid,
  p_candidate_id uuid,
  p_token_digest text,
  p_receipt_hash text,
  p_time_taken_seconds integer,
  p_anomaly_score numeric,
  p_is_quarantined boolean default false
)
returns table (vote_id uuid, receipt_hash text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_id uuid;
begin
  if p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token digest' using errcode = '22023';
  end if;

  if p_receipt_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid receipt hash' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.ballots b
    where b.id = p_ballot_id
      and now() between b.start_time and b.end_time
  ) then
    raise exception 'Ballot is not open' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.candidates c
    where c.id = p_candidate_id
      and c.ballot_id = p_ballot_id
      and c.nomination_status = 'APPROVED'
  ) then
    raise exception 'Candidate is not eligible for this ballot' using errcode = '22023';
  end if;

  insert into public.vote_hashes (
    ballot_id,
    candidate_id,
    token_digest,
    receipt_hash,
    time_taken_seconds,
    anomaly_score,
    is_quarantined
  ) values (
    p_ballot_id,
    p_candidate_id,
    p_token_digest,
    p_receipt_hash,
    p_time_taken_seconds,
    p_anomaly_score,
    p_is_quarantined
  )
  returning id into inserted_id;

  return query select inserted_id, p_receipt_hash;
exception
  when unique_violation then
    raise exception 'Vote token or receipt has already been used' using errcode = '23505';
end;
$$;

alter table public.students enable row level security;
alter table public.ballots enable row level security;
alter table public.candidates enable row level security;
alter table public.voter_logs enable row level security;
alter table public.vote_hashes enable row level security;

revoke all on table public.students from anon, authenticated;
revoke all on table public.ballots from anon, authenticated;
revoke all on table public.candidates from anon, authenticated;
revoke all on table public.voter_logs from anon, authenticated;
revoke all on table public.vote_hashes from anon, authenticated;
revoke all on function public.cast_anonymous_vote(uuid, uuid, text, text, integer, numeric, boolean)
  from public, anon, authenticated;

grant select, insert, update, delete on table public.students to service_role;
grant select, insert, update, delete on table public.ballots to service_role;
grant select, insert, update, delete on table public.candidates to service_role;
grant select, insert, update, delete on table public.voter_logs to service_role;
grant select, insert, update, delete on table public.vote_hashes to service_role;
grant execute on function public.cast_anonymous_vote(uuid, uuid, text, text, integer, numeric, boolean)
  to service_role;
