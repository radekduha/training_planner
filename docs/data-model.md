# Data model (MVP)

## Enums
- Request status: `draft`, `open`, `assigned`, `confirmed`, `canceled`

## Tables

### topic
- id
- name
- duration_minutes
- created_at
- updated_at

### trainer
- id
- name
- email
- phone
- notes
- created_at
- updated_at

### trainer_skill
- id
- trainer_id
- topic_id

### trainer_availability_slot
- id
- trainer_id
- start_datetime
- end_datetime
- is_active
- created_at
- updated_at

### training_request
- id
- topic_id
- customer_name
- location_text
- window_start (nullable)
- window_end (nullable)
- status
- notes
- created_at
- updated_at

### training_assignment
- id
- training_request_id
- trainer_id
- slot_id
- assigned_start_datetime
- assigned_end_datetime
- assignment_reason
- changed_by
- created_at
- updated_at

## Derived metrics (monthly)
- offered_days per trainer (from availability slots)
- delivered_days per trainer (from assignments)
- target_share and actual_share for fairness

## Indexes
- `training_request(status)`
- `training_request(window_start, window_end)`
- `trainer_skill(trainer_id, topic_id)`
- `trainer_availability_slot(trainer_id, start_datetime, end_datetime)`
- `training_assignment(training_request_id)`
- `training_assignment(slot_id)`
