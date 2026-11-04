# Leave credit ledger and scheduler recovery update

## What changed
- Opening-balance setup now accepts an optional `openingBalanceExpiryDate` in individual and bulk balance configuration.
- Initial balance configuration writes separate credit lots for Opening Balance, preloaded Accrued Balance, Carry Forward, and positive Manual Adjustment amounts.
- Each credit transaction stores `remainingAmount`, `consumedAmount`, and `expiredAmount`.
- Monthly/quarterly/half-yearly/yearly accrual transactions are created as individual credit lots and receive an expiry date from the leave policy.
- `expiryMonths = 1` means expire at the end of the credit month; `2` means expire at the end of the following month. `0` means no expiry.
- Expiry processes each credit lot separately, updates the balance snapshot and writes an Expiry transaction. It defers a lot while the aggregate pending reservation would be affected.
- Final leave approval consumes credit lots in earliest-expiry-first order.
- Scheduler startup and hourly ticks replay due calendar dates (up to the last three years) from the earliest active policy effective date. Accrual keys make replay idempotent and expiry scans all overdue credits.

## Configuration for monthly leave
For a one-day monthly leave that must expire in the same month:
- Accrual Frequency: Monthly
- Accrual Amount: 1
- Carry Forward Allowed: Off
- Expiry Months: 1
- Opening Balance Expiry Date: set explicitly while creating the initial employee balance if that opening credit should expire.

## Important operational notes
- Leave application continues to reserve balance in `pendingBalance`; credit lots are consumed on final approval. The expiry job protects the aggregate pending reservation and retries deferred expiry on a later scheduler tick.
- The optional opening-balance expiry date applies when creating a new balance record. Existing legacy opening credits with no expiry remain non-expiring unless their transaction records are manually migrated/updated.
- Existing historical transactions are not destructively rewritten. Older credits with a null `remainingAmount` are calculated from amount minus recorded consumption/expiry when processed.
- Scheduler idempotency relies on the existing unique sparse index on `accrualKey`; ensure MongoDB indexes are built successfully during deployment.
- This archive was syntax-checked, but a live MongoDB integration test and browser workflow test were not possible in this environment.
