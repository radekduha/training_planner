## **1️⃣ Context and problem**

The project owner organizes trainings across the whole Czech Republic and works with approximately **50 external trainers**.

Each trainer has their own conditions:

- maximum distance they are willing to travel
- willingness to train on weekends
- frequency of long trips
- price
- time availability

Today, everything is planned **manually** (phone, email, Excel, notes). This is:

- time‑consuming
- error‑prone
- hard to scale at around 100 trainings per month
- mentally exhausting (constant checking of details)

**Business pain:** the owner spends too much time on complex manual decision‑making instead of focusing on developing the project.

---

## **2️⃣ Product goal (business-wise)**

Create a **simple internal web application** that:

- shortens the time to find a suitable trainer to **≤ 2 minutes**,
- reduces the amount of manual checking of conditions (distance, weekend, workload),
- provides a **clear recommendation** ("why this trainer specifically"),
- centralizes information into a single tool (no more spreadsheets + notes + separate calendar).

The application is meant to help **a single user (the owner)** make **quick and safe decisions** about staffing trainings.

---

## **3️⃣ Success metrics**

- **Tactical metric:**
    - finding a usable trainer within **≤ 2 minutes** from creating the training
- **Operational metrics:**
    - most trainings are staffed without needing to open Excel or other notes
    - the owner subjectively evaluates planning as "clear and calm" (e.g. NPS question once per quarter)
- **Qualitative:**
    - the decision "why this trainer" is understandable even several months later

---

## **4️⃣ Key design principles**

The application should be:

- **Easy to use** – a single primary flow "plan training → select trainer".
- **Clear** – minimum number of screens, clear status of each training.
- **Predictable** – clear rules, no "magical" behavior.
- **Maintainable** – simple data model, no unnecessary integrations in the MVP.
- **Extensible** – ready for Google Calendar and other small improvements without needing to rewrite the core.

---

## **5️⃣ User scenarios (user flows)**

### **5.1 Creating and staffing a new training**

1. The user clicks **"New training"**.
2. Fills in:
    - training type
    - address (free text)
    - date and time (from–to)
3. Saves. Status is automatically set to **"waiting for trainer"**.
4. The system offers a **sorted list of recommended trainers**.
5. The user:
    - selects a trainer
    - optionally adjusts details
    - saves → status changes to **"assigned"** or **"confirmed"** (depending on agreement with the trainer outside the system).

### **5.2 Editing or canceling a training**

1. The user opens a training from the list or from the calendar.
2. They can:
    - edit time / address
    - change the trainer (run recommendations again)
    - mark the training as **"canceled"** (status "canceled" is added as an extra status and **is not counted** towards workload).

### **5.3 Adding a new trainer**

1. The user clicks **"New trainer"**.
2. Fills in:
    - name, contact details
    - home address (free text)
    - training types
    - price
    - conditions (max. km, weekend yes/no, limit of long trips)
3. On save, the address is geocoded and distance is used during recommendations.

---

## **6️⃣ Training state model**

An extended state model for a **simple and readable workflow**:

- **draft** – training in progress, trainer search has not started yet
- **waiting for trainer** – training is ready, but no trainer is selected yet
- **assigned** – trainer selected internally, but not yet finally confirmed (confirmation happens outside the system)
- **confirmed** – trainer confirmed, the training will take place
- **canceled** – training canceled (is not counted towards workload nor long trips)

**Transition rules (simplified):**

- draft → waiting for trainer (user marks training as ready)
- waiting for trainer → assigned (user selects a trainer in the application)
- assigned → confirmed (confirmation with the trainer happens outside the system, the user only switches the status)
- anything → canceled (if the event is canceled)

This model is simple but reflects reality and is easily understandable even in retrospect.

---

## **7️⃣ Functional scope of MVP (in scope)**

### **7.1 Trainer records**

**Each trainer:**

- name and contact details
- home address (free text)
- training types taught
- price per training (one selected model, e.g. price per day)
- notes

**Trainer conditions (rules):**

- maximum distance (km)
- trains / does not train on weekends
- maximum number of "long trips" per month (e.g. over 150 km)
- (optionally) preferred days of the week

---

### **7.2 Training records**

**Each training:**

- training type
- address (free text)
- date and time (from–to)
- status (see model above)
- assigned trainer (optional)
- internal notes
- (prepared) `google_event_id`

---

### **7.3 Matching and trainer recommendations (core functionality)**

### **Step 1 – hard filtering (hard constraints)**

Exclude trainers who:

- do not teach the given training type
- have a collision in the calendar (time conflict)
- do not train on weekends (if the training is on a weekend)
- exceed the maximum allowed distance

**Edge behavior:**

- if no trainer meets all hard conditions:
    - the system displays the message "No one meets all conditions"
    - at the same time it offers the **closest possible candidates** who break at most **one** condition (e.g. slightly over the km limit), clearly marked as ⚠️ a compromise.

### **Step 2 – scoring (soft constraints)**

The remaining trainers (or the selected "compromise" group) receive a score based on:

- distance (shorter = better)
- number of trainings in the given month (fewer = better distribution)
- price (cheaper = better, but not at the cost of extreme distances)
- number of long trips in the month (fewer long trips = better)

**Default logic (described in words, not exact weights):**

- primarily we prefer **reasonable distance**
- secondarily **balanced workload** (do not overload one person)
- price is a **third factor**, so the system does not always pick the cheapest trainer
- long trips are limited based on trainer rules

**Output:**

- sorted list of trainers
- for each trainer:
    - price
    - distance
    - workload in the month (number of trainings + long trips)
    - short explanation ("Why recommended" / "What to watch out for")

---

## **8️⃣ Overviews and navigation**

### **8.1 Training list**

- basic tabular overview of trainings
- filters:
    - date (from–to)
    - status
    - training type
- quick filter: **"without trainer"** (draft + waiting for trainer)

### **8.2 Calendar view**

- simple **monthly view** as default
- option to switch to **weekly** (if needed)
- clicking a training opens a detail where the user can:
    - change status
    - select a trainer again

### **8.3 Trainer detail**

- basic data and conditions
- training history (list of past and future trainings)
- quick overview of workload in the current month

---

## **9️⃣ Addresses and distances**

- address entered as **free text**
- on save it is **geocoded** to lat/lng
- distance is calculated **as the crow flies (Haversine)**
- road distances and map APIs are **not part of the MVP**

UX simplifications:

- no live maps in the MVP
- no complex address validation – if geocoding fails, show a simple message and let the user correct the address.

---

## **🔟 Non‑functional requirements**

- web application (responsive for desktop and mobile)
- access for a single user only (no need to resolve roles)
- low operating costs (hosting in the order of a few hundred CZK per month)
- automatic data backups (handled at hosting / DB level)
- simple extensibility (clean data model, no hard‑coupling to integrations)

---

## **1️⃣1️⃣ Audit and history (lightweight)**

Even though there is only one user:

- for trainings and trainers, store:
    - creation date (`created_at`)
    - last update date (`updated_at`)

A full audit log is not necessary, but these fields **improve traceability** without complicating development.

---

## **1️⃣2️⃣ Google Calendar (out of scope, but prepared)**

- the trainings table contains a `google_event_id` field

**MVP:**

- own internal calendar

**V2+:**

- one‑way synchronization of **confirmed trainings** → Google Calendar
- 1 shared calendar (owner’s)

---

## **1️⃣3️⃣ Explicitly out of MVP scope**

- substitute trainer
- automatic trainer confirmations
- notifications to trainers
- advanced workflows for cancelations / rescheduling
- AI / machine learning
- complex pricing (combination of multiple price models at once)

---

## **1️⃣4️⃣ Data model (MVP)**

The basic data model remains simple:

### **trainer**

- id
- name
- home_address
- lat, lng
- base_price
- notes
- created_at
- updated_at

### **trainer_skill**

- trainer_id
- training_type_id

### **trainer_rule**

- trainer_id
- rule_type
- rule_value (JSON or structured)

### **training**

- id
- training_type_id
- address
- lat, lng
- start_datetime
- end_datetime
- status (including "canceled")
- assigned_trainer_id
- google_event_id
- notes
- created_at
- updated_at

---

## **1️⃣5️⃣ Why this is a good MVP**

- solves the main pain (fast and safe trainer assignment)
- does not cover unnecessary areas (roles, notifications, complex workflows)
- remains understandable even a year later (simple model, clear statuses)
- can be easily extended (Google Calendar, location catalog, reports)
- Google Calendar is "just a plugin on top", not the core of the system