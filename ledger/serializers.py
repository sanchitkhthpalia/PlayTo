from rest_framework import serializers
from .models import Payout, LedgerEntry

class PayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = ['id', 'merchant', 'amount_paise', 'bank_account_id', 'status', 'idempotency_key', 'created_at']
        read_only_fields = ['id', 'status', 'created_at']

class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ['id', 'merchant', 'amount_paise', 'type', 'reference_id', 'created_at']
