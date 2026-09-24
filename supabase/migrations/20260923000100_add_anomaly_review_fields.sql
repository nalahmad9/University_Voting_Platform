alter table public.vote_hashes
  add column risk_features jsonb not null default '{}'::jsonb,
  add column anomaly_model_version varchar(80) not null default 'legacy',
  add column review_status varchar(20) not null default 'NOT_REQUIRED',
  add column review_reason text,
  add column reviewed_at timestamptz,
  add column reviewed_by varchar(150);

alter table public.vote_hashes
  add constraint vote_hashes_risk_features_object_check
    check (jsonb_typeof(risk_features) = 'object'),
  add constraint vote_hashes_risk_features_privacy_check
    check (not (risk_features ?| array[
      'studentId', 'student_id', 'voterId', 'voter_id', 'jwt', 'cookie',
      'sessionId', 'session_id', 'ip', 'ipAddress', 'userAgent', 'candidateId'
    ])),
  add constraint vote_hashes_review_status_check
    check (review_status in ('NOT_REQUIRED', 'PENDING', 'RESTORED', 'CONFIRMED')),
  add constraint vote_hashes_review_decision_check
    check (
      (review_status in ('NOT_REQUIRED', 'PENDING') and review_reason is null and reviewed_at is null and reviewed_by is null)
      or
      (review_status in ('RESTORED', 'CONFIRMED') and length(trim(review_reason)) >= 10 and reviewed_at is not null and reviewed_by is not null)
    );

update public.vote_hashes
set review_status = 'PENDING'
where is_quarantined;

create index vote_hashes_review_status_idx
  on public.vote_hashes (review_status, created_at desc);

comment on column public.vote_hashes.risk_features is
  'Coarse anonymous anomaly features only. Identity, network identifiers, candidate choice and session data are forbidden.';
