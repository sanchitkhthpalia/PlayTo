import uuid
from django.db import models
from django.db.models import Sum, Case, When, Value, BigIntegerField

class Merchant(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def get_balance(self) -> int:
        # Sum credits/releases, subtract debits/holds.
        # Everything stays in integer paise to avoid float precision issues.
        # Calculate credits and debits separately then subtract to be safe across DB backends
        result = self.ledger_entries.aggregate(
            credits=Sum(
                Case(
                    When(type__in=['credit', 'release'], then='amount_paise'),
                    default=Value(0),
                    output_field=BigIntegerField(),
                )
            ),
            debits=Sum(
                Case(
                    When(type__in=['debit', 'hold'], then='amount_paise'),
                    default=Value(0),
                    output_field=BigIntegerField(),
                )
            )
        )
        
        credits = result.get('credits') or 0
        debits = result.get('debits') or 0
        return credits - debits

    def get_held_balance(self) -> int:
        # Held balance is money currently in 'hold' state (not yet released or completed)
        # Note: In this simple ledger, held funds stay as 'hold' entries.
        # We calculate it as (Sum of Holds) - (Sum of Releases)
        result = self.ledger_entries.aggregate(
            holds=Sum(
                Case(When(type='hold', then='amount_paise'), default=Value(0))
            ),
            releases=Sum(
                Case(When(type='release', then='amount_paise'), default=Value(0))
            )
        )
        return (result.get('holds') or 0) - (result.get('releases') or 0)

    def __str__(self):
        return self.name

class LedgerEntry(models.Model):
    TYPE_CHOICES = [
        ('credit', 'Credit'),
        ('debit', 'Debit'),
        ('hold', 'Hold'),
        ('release', 'Release'),
    ]

    merchant = models.ForeignKey(Merchant, related_name='ledger_entries', on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    reference_id = models.UUIDField(default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.merchant.name} - {self.type} - {self.amount_paise}"

class Payout(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    merchant = models.ForeignKey(Merchant, related_name='payouts', on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    bank_account_id = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    idempotency_key = models.CharField(max_length=255)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('merchant', 'idempotency_key')

    def transition_status(self, new_status, reason=None):
        # Strict state machine to prevent double-spending or illegal states
        legal_transitions = {
            'pending': ['processing'],
            'processing': ['completed', 'failed'],
        }

        if new_status not in legal_transitions.get(self.status, []):
            raise ValueError(f"Illegal transition from {self.status} to {new_status}")

        old_status = self.status
        if new_status == 'failed':
            from django.db import transaction
            from .models import LedgerEntry
            with transaction.atomic():
                self.status = new_status
                self.save()
                # Return the held funds back to available balance
                LedgerEntry.objects.create(
                    merchant=self.merchant,
                    amount_paise=self.amount_paise,
                    type='release'
                )
        else:
            self.status = new_status
            self.save()
        
        # New: Audit Logging
        PayoutAuditLog.objects.create(
            payout=self,
            from_status=old_status,
            to_status=new_status,
            reason=reason
        )

    def __str__(self):
        return f"Payout {self.id} - {self.merchant.name} - {self.status}"

class PayoutAuditLog(models.Model):
    payout = models.ForeignKey(Payout, on_delete=models.CASCADE, related_name='audit_logs')
    from_status = models.CharField(max_length=20)
    to_status = models.CharField(max_length=20)
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"AuditLog {self.id} - Payout {self.payout_id}"
