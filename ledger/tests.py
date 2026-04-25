import uuid
import concurrent.futures
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from django.test import TransactionTestCase
from ledger.models import Merchant, LedgerEntry, Payout

class PayoutTests(APITestCase):
    def test_idempotent_payout_request(self):
        merchant = Merchant.objects.create(name="Test Merchant")
        LedgerEntry.objects.create(merchant=merchant, amount_paise=5000, type='credit')
        
        url = reverse('payout-request') # Note: Assuming name='payout-request' in urls.py
        data = {
            "merchant_id": merchant.id,
            "amount_paise": 1000,
            "bank_account_id": "BANK123"
        }
        idempotency_key = str(uuid.uuid4())
        headers = {'HTTP_IDEMPOTENCY_KEY': idempotency_key}

        # First request
        response1 = self.client.post(url, data, format='json', **headers)
        self.assertEqual(response1.status_code, 201)

        # Second request (replay)
        response2 = self.client.post(url, data, format='json', **headers)
        self.assertEqual(response2.status_code, 200)

        # Verify only one Payout was created
        self.assertEqual(Payout.objects.filter(merchant=merchant).count(), 1)


class ConcurrencyTests(TransactionTestCase):
    # Using TransactionTestCase because threads will use separate DB connections
    def test_concurrent_payouts_prevent_overdraw(self):
        merchant = Merchant.objects.create(name="Race Merchant")
        LedgerEntry.objects.create(merchant=merchant, amount_paise=100, type='credit')
        
        # We need a fresh client for each thread or at least non-conflicting states
        # but the actual isolation happens at the DB level with select_for_update
        url = '/api/v1/payouts' # Hardcoded path if reverse is not set up
        
        def send_payout():
            # Create a new client per thread to simulate real world
            client = APIClient()
            return client.post(
                url, 
                {
                    "merchant_id": merchant.id,
                    "amount_paise": 60,
                    "bank_account_id": "BANK_XYZ"
                },
                format='json',
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            # Fire off two 60-paise requests against a 100-paise balance
            futures = [executor.submit(send_payout) for _ in range(2)]
            results = [f.result() for f in futures]

        # One should have succeeded (201), the other should have failed (400)
        status_codes = [r.status_code for r in results]
        self.assertIn(201, status_codes)
        self.assertIn(400, status_codes)

        # Final balance must be exactly 40
        merchant.refresh_from_db()
        self.assertEqual(merchant.get_balance(), 40)
