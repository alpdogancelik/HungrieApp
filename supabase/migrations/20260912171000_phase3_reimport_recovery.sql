-- Keep reverted insertion history while permitting a corrected import with a new run ID.
alter table private.account_classification_entries
  drop constraint account_classification_entries_profile_id_key;
create index account_classification_entries_profile_idx
  on private.account_classification_entries(profile_id);
