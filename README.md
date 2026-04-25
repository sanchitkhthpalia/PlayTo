# Playto Payout Engine (Challenge 2026)

This is a minimal payout engine designed for high concurrency and data integrity. It handles merchant ledgers, idempotent payout requests, and automated background processing with retry logic.

## Technical Highlights
- **Ledger-based Balance**: Balances are never "saved"; they are derived from immutable credit/debit entries.
- **Race Condition Prevention**: Uses `select_for_update` for row-level locking during balance checks.
- **Idempotency**: Requests have a 24-hour window tied to a merchant-specific UUID key.
- **State Machine**: Guaranteed atomic fund releases on failed status transitions.

## Locally Running the Project

### Prerequisites
- Python 3.12+
- PostgreSQL
- Redis (for Celery)

### 1. Setup Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed initial merchants and credits
python manage.py seed

# Start the server
python manage.py runserver
```

### 2. Start Worker (Celery)
In a separate terminal:
```bash
celery -A playto_pay worker --loglevel=info
celery -A playto_pay beat --loglevel=info
```

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

## Running Tests
I've included two core tests for the "make-or-break" parts of the system:
```bash
# Tests idempotency and concurrent overdraw prevention
python manage.py test
```

## Project Structure
- `ledger/models.py`: The heart of the system. Contains the ledger logic and state machine.
- `ledger/tasks.py`: Background worker logic for settlement and retries.
- `ledger/views.py`: API endpoints for payouts and balances.
- `frontend/src/App.jsx`: Dashboard for merchant interaction.
