# Leave Policies update

- Added `LeavePolicy` model, CRUD endpoints and `/api/v1/user-management/leave-policies`.
- Added admin UI route `/admin/leave-policies` and HR Management sidebar entry.
- Policy fields include accrual frequency/amount, annual entitlement, carry-forward cap, expiry months, effective date, active status and notes.
- Important: saving a policy currently stores configuration only. It does not automatically credit accrued balance. A scheduled/idempotent accrual job and transaction-based credit workflow are still required before automatic monthly/quarterly/yearly credits can happen.
