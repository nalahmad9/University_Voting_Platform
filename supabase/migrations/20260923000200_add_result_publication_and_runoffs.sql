alter table public.ballots
  add column results_published_at timestamptz,
  add column published_results jsonb,
  add column runoff_of_ballot_id uuid,
  add column round_number integer not null default 1;

alter table public.ballots
  add constraint ballots_publication_pair_check
    check ((results_published_at is null) = (published_results is null)),
  add constraint ballots_published_results_object_check
    check (published_results is null or jsonb_typeof(published_results) = 'object'),
  add constraint ballots_published_results_privacy_check
    check (published_results is null or not (published_results ?| array[
      'studentId', 'student_id', 'voterId', 'voter_id', 'jwt', 'cookie',
      'sessionId', 'session_id', 'ip', 'ipAddress', 'userAgent', 'token', 'receipt'
    ])),
  add constraint ballots_round_number_check
    check (round_number >= 1),
  add constraint ballots_runoff_round_check
    check (
      (runoff_of_ballot_id is null and round_number = 1)
      or
      (runoff_of_ballot_id is not null and round_number >= 2)
    ),
  add constraint ballots_runoff_parent_fk
    foreign key (runoff_of_ballot_id) references public.ballots(id) on delete restrict,
  add constraint ballots_runoff_not_self_check
    check (runoff_of_ballot_id is null or runoff_of_ballot_id <> id),
  add constraint ballots_runoff_of_unique
    unique (runoff_of_ballot_id);

create index ballots_results_published_idx
  on public.ballots (results_published_at desc)
  where results_published_at is not null;

comment on column public.ballots.published_results is
  'Immutable public result snapshot created after anomaly review. Contains aggregate candidate totals only.';

comment on column public.ballots.runoff_of_ballot_id is
  'Parent ballot for an automatically prepared runoff. A ballot may have at most one direct runoff.';
