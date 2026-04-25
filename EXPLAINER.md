# EXPLAINER.md: Technical Decisions

This document breaks down how I handled the money-moving logic for this challenge. No buzzwords, just the engineering behind the decisions.

### 1. The Ledger
Here is the dynamic balance calculation from `models.py`:

```python
result = self.ledger_entries.aggregate(
    credits=Sum(
        Case(When(type__in=['credit', 'release'], then='amount_paise'), default=Value(0))
    ),
    debits=Sum(
        Case(When(type__in=['debit', 'hold'], then='amount_paise'), default=Value(0))
    )
)
return (result.get('credits') or 0) - (result.get('debits') or 0)
```

**Why this way?**
Standard integer fields for "balance" are dangerous. They look easy but they drift over time due to partial failures or race conditions. Modelling balance as a aggregate of immutable ledger entries (credits and debits) gives us a perfect audit trail. We always know *how* we arrived at a balance.

### 2. The Lock
To prevent a merchant from overdrawing their balance via concurrent requests, I use PostgreSQL row-level locks.

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant_id)
    current_balance = merchant.get_balance()
    if current_balance < int(amount_paise):
        return Response({"error": "Insufficient funds"}, status=400)
```

**The Primitive:**
This uses `SELECT FOR UPDATE`. It tells the database to lock the specific merchant row until the transaction finishes. If two requests for the same merchant arrive at the same time, the second request will wait at the `get()` line until the first one commits or rolls back. This turns a race condition into a predictable queue.

### 3. The Idempotency
We identify repeat requests by checking the `idempotency_key` (per-merchant) in the database.

**What happens if the first request is still processing?**
We scope the key to the merchant. Because the first request holds a `select_for_update` lock on the merchant, the second request will hang at the locking line. By the time the second request gets the lock, the first one has already created the Payout record. The second request then finds that record in the DB and returns the same response (200 OK) instead of trying to create a new one.

### 4. The State Machine
Illegal transitions (like `failed` to `completed`) are blocked in the `transition_status` method.

```python
legal_transitions = {
    'pending': ['processing'],
    'processing': ['completed', 'failed'],
}
if new_status not in legal_transitions.get(self.status, []):
    raise ValueError(f"Illegal transition from {self.status} to {new_status}")
```

If the status is `failed` or `completed`, the dictionary lookup returns an empty list, so any new status will trigger the `ValueError`.

### 5. The AI Audit
An AI assistant initially suggested this logic for handling a payout:

```python
# BROKEN AI CODE
def create_payout(merchant, amount):
    if merchant.balance >= amount:
        merchant.balance -= amount
        merchant.save()
        Payout.objects.create(merchant=merchant, amount=amount)
```

**What I caught:**
This code is a disaster for a fintech app. It has a massive race condition: if two requests run at once, they both see the same `merchant.balance`, they both pass the check, and the merchant overdraws. I discarded this immediately and replaced it with `select_for_update` row-locking and dynamic balance derivation directly from the ledger.
