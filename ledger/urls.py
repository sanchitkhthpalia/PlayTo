from django.urls import path
from .views import PayoutRequestView, merchant_detail, transaction_list

urlpatterns = [
    path('payouts/', PayoutRequestView.as_view(), name='payout-request'),
    path('merchants/<int:pk>/', merchant_detail, name='merchant-detail'),
    path('transactions/', transaction_list, name='transaction-list'),
]
