from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view
from .models import Merchant, Payout, LedgerEntry
from .serializers import PayoutSerializer, LedgerEntrySerializer

@api_view(['GET'])
def transaction_list(request):
    merchant_id = request.query_params.get('merchant_id')
    if not merchant_id:
        return Response({"error": "merchant_id required"}, status=400)
    
    entries = LedgerEntry.objects.filter(merchant_id=merchant_id).order_by('-created_at')
    serializer = LedgerEntrySerializer(entries, many=True)
    return Response(serializer.data)

@api_view(['GET'])
def merchant_detail(request, pk):
    try:
        merchant = Merchant.objects.get(pk=pk)
        # We derive the balance directly from the Ledger here
        return Response({
            "id": merchant.id,
            "name": merchant.name,
            "balance_paise": merchant.get_balance(),
            "held_balance_paise": merchant.get_held_balance()
        })
    except Merchant.DoesNotExist:
        return Response({"error": "Merchant not found"}, status=404)

class PayoutRequestView(APIView):
    def get(self, request):
        merchant_id = request.query_params.get('merchant_id')
        if not merchant_id:
            return Response({"error": "merchant_id query param is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        payouts = Payout.objects.filter(merchant_id=merchant_id).order_by('-created_at')
        serializer = PayoutSerializer(payouts, many=True)
        return Response(serializer.data)

    def post(self, request):
        merchant_id = request.data.get('merchant_id')
        amount_paise = request.data.get('amount_paise')
        bank_account_id = request.data.get('bank_account_id')
        
        # TODO: Get merchant_id from auth token instead of request body
        if not merchant_id or not amount_paise or not bank_account_id:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

        # Idempotency check protocol
        idempotency_key = request.META.get('HTTP_IDEMPOTENCY_KEY')
        if not idempotency_key:
            return Response({"error": "Idempotency-Key header is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Check for existing payout within the 24-hour window
        existing_payout = Payout.objects.filter(
            merchant_id=merchant_id, 
            idempotency_key=idempotency_key
        ).first()

        if existing_payout:
            cutoff = timezone.now() - timedelta(hours=24)
            if existing_payout.created_at > cutoff:
                serializer = PayoutSerializer(existing_payout)
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                # If it's older than 24h, the key is reusable based on our rules,
                # but unique_together will block it anyway if we don't handle it.
                # In a real system, we'd probably archive old keys or use a timestamp in the unique index.
                return Response({"error": "Idempotency key expired or already used"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # Lock the merchant record to prevent concurrent balance checks from passing
                merchant = Merchant.objects.select_for_update().get(id=merchant_id)
                
                current_balance = merchant.get_balance()
                
                if current_balance < int(amount_paise):
                    return Response({"error": "Insufficient funds"}, status=status.HTTP_400_BAD_REQUEST)

                # Create the record of the payout intent
                payout = Payout.objects.create(
                    merchant=merchant,
                    amount_paise=amount_paise,
                    bank_account_id=bank_account_id,
                    idempotency_key=idempotency_key,
                    status='pending'
                )

                # Move the money to 'hold' to reflect the reduction in available balance
                LedgerEntry.objects.create(
                    merchant=merchant,
                    amount_paise=amount_paise,
                    type='hold',
                    # Link to the payout for traceability
                    # TODO: add a generic ForeignKey or specific payout_id to LedgerEntry?
                )

                serializer = PayoutSerializer(payout)
                return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Merchant.DoesNotExist:
            return Response({"error": "Merchant not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            # TODO: Log this properly. Don't expose raw exception details to the client in production.
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)