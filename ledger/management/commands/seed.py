from django.core.management.base import BaseCommand
from ledger.models import Merchant, LedgerEntry, Payout

class Command(BaseCommand):
    help = "Seeds initial data for testing"

    def handle(self, *args, **options):
        # Wipe and Reset Sequences (Postgres specific)
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("TRUNCATE TABLE ledger_payout, ledger_ledgerentry, ledger_merchant RESTART IDENTITY CASCADE;")

        # Merchant A
        m_a = Merchant.objects.create(name="Merchant A")
        LedgerEntry.objects.create(merchant=m_a, amount_paise=5000, type='credit')
        LedgerEntry.objects.create(merchant=m_a, amount_paise=3000, type='credit')
        LedgerEntry.objects.create(merchant=m_a, amount_paise=2000, type='credit')

        # Merchant B
        m_b = Merchant.objects.create(name="Merchant B")
        LedgerEntry.objects.create(merchant=m_b, amount_paise=2500, type='credit')
        LedgerEntry.objects.create(merchant=m_b, amount_paise=2500, type='credit')

        self.stdout.write(self.style.SUCCESS("Database seeded successfully."))
        self.stdout.write(self.style.SUCCESS(f"Merchant A Balance: {m_a.get_balance()} paise"))
        self.stdout.write(self.style.SUCCESS(f"Merchant B Balance: {m_b.get_balance()} paise"))
