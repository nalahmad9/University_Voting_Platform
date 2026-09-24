alter table public.candidates
  drop constraint candidates_ai_summary_check;

alter table public.candidates
  add constraint candidates_ai_summary_check check (
    ai_summary is null
    or (
      jsonb_typeof(ai_summary) = 'array'
      and jsonb_array_length(ai_summary) = 3
    )
    or (
      jsonb_typeof(ai_summary) = 'object'
      and ai_summary ->> 'version' = '1'
      and jsonb_typeof(ai_summary -> 'highlights') = 'array'
      and jsonb_array_length(ai_summary -> 'highlights') = 3
      and jsonb_typeof(ai_summary -> 'topics') = 'object'
      and jsonb_typeof(ai_summary -> 'generation') = 'object'
    )
  );

comment on column public.candidates.ai_summary is
  'Manifesto highlights, comparison topics, generation provenance and administrator review metadata. Legacy three-item highlight arrays remain readable.';
