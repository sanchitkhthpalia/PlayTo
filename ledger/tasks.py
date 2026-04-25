import random
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from .models import Payout

@shared_task(bind=True, max_retries=3)
def process_payout(self, payout_id):
    try:
        payout = Payout.objects.get(id=payout_id)
        
        # Start processing if still pending
        if payout.status == 'pending':
            payout.transition_status('processing', reason="Initiating bank transfer")

        # Simulate bank API latency or logic
        rand = random.random()
        if rand < 0.70:
            payout.transition_status('completed', reason="Bank settled successfully")
        elif rand < 0.90:
            payout.transition_status('failed', reason="Bank rejected transfer")
        else:
            # 10% chance: Bank doesn't respond or connection Drops
            # We do nothing here, the sweeper will pick it up.
            pass

    except Payout.DoesNotExist:
        # Payout was deleted or ID is wrong? Log and forget.
        pass
    except Exception as e:
        # TODO: proper logging
        raise self.retry(exc=e)

@shared_task
def sweep_stuck_payouts():
    # Find payouts stuck in processing for more than 30 seconds
    cutoff = timezone.now() - timedelta(seconds=30)
    stuck_payouts = Payout.objects.filter(status='processing', updated_at__lt=cutoff)
    
    for payout in stuck_payouts:
        with transaction.atomic():
            # Refresh from DB and lock
            payout = Payout.objects.select_for_update().get(id=payout.id)
            
            payout.attempts += 1
            payout.save()
            
            if payout.attempts >= 3:
                # Too many tries, marking as failed to release the funds
                payout.transition_status('failed', reason="Max retry attempts reached")
            else:
                # Exponential backoff: 2, 4, 8 seconds
                backoff = 2 ** payout.attempts
                process_payout.apply_async(args=[payout.id], countdown=backoff)
