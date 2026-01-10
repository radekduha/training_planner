# Data model (MVP)

## Enums
- Training status: `draft`, `waiting`, `assigned`, `confirmed`, `canceled`

## Tables

### training_type
- id
- name
- created_at
- updated_at

### trainer
- id
- name
- email
- phone
- home_address
- home_lat
- home_lng
- base_price
- notes
- created_at
- updated_at

### trainer_skill
- id
- trainer_id
- training_type_id

### trainer_rule
- id
- trainer_id
- rule_type
- rule_value (JSON)

### training
- id
- training_type_id
- address
- lat
- lng
- start_datetime
- end_datetime
- status
- assigned_trainer_id (nullable)
- google_event_id (nullable)
- notes
- created_at
- updated_at

## Indexes
- `training(start_datetime)`
- `training(status)`
- `training(assigned_trainer_id)`
- `trainer_skill(trainer_id, training_type_id)`
