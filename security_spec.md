# Security Specification — NFC Prospect (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every document across `users`, `businesses`, `leads`, `interactions`, `products`, `sales`, `sale_items`, `inventory_movements`, `expenses`, `reminders`, and `search_history` is strictly owned by a single authenticated, email-verified user (`ownerId == request.auth.uid`, or `uid == request.auth.uid` for `users/{userId}`).
2. **No Cross-Tenant Reads or List Scraping**: Every `allow get` and `allow list` validates `resource.data.ownerId == request.auth.uid` directly in the rule (no client-side query delegation).
3. **Referential Integrity on Relational Entities**:
   - A `Lead` cannot be created without an existing `Business` belonging to the same `ownerId`.
   - An `Interaction` or `Reminder` cannot be created without an existing `Lead` belonging to the same `ownerId`.
   - A `SaleItem` cannot be created without an existing `Sale` or `Product` belonging to the same `ownerId` (validated via `existsAfter` / `exists` for atomic transactions).
   - An `InventoryMovement` cannot be created without an existing `Product` belonging to the same `ownerId`.
4. **Immutability & Temporal Integrity**: `ownerId`, `id`, `placeId`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must strictly equal `request.time`.
5. **Double Stock Deduction Guard**: Once a `Sale` has `stockDeducted == true`, it cannot revert `stockDeducted` to `false` or change `totalQuantity`, and `InventoryMovement` records are append-only (no update or delete).
6. **Terminal Lock**: Cancelled sales (`paymentStatus == 'cancelado'`) cannot be modified after reaching terminal state.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-Tenant Spoofing**: Creating a `Lead` with `ownerId: "victim-uid"` while authenticated as `"attacker-uid"`.
2. **Unverified Email Bypass**: Attempting any write when `request.auth.token.email_verified == false`.
3. **Ghost / Shadow Field Injection**: Creating a `UserProfile` with extra shadow field `{ isAdmin: true }` or `{ role: "superadmin" }`.
4. **ID Poisoning**: Creating a document at `/businesses/invalid$id!withSpacesAnd1500Bytes...` violating `isValidId()`.
5. **Client Timestamp Forgery**: Creating a `Sale` with backdated `createdAt` not equal to `request.time`.
6. **Immutable Owner Tampering**: Updating a `Lead` to change `ownerId` or `createdAt` or `placeId`.
7. **Orphaned Lead Creation**: Creating a `Lead` referencing a non-existent `businessId` or another user's `businessId`.
8. **Orphaned Interaction Creation**: Creating an `Interaction` referencing another user's `leadId`.
9. **Double Stock Deduction Tampering**: Updating a `Sale` where `stockDeducted == true` to set `stockDeducted: false`.
10. **Ledger Tampering**: Attempting `update` or `delete` on `/inventory_movements/{id}`.
11. **Terminal State Mutation**: Updating a `Sale` whose existing `paymentStatus == 'cancelado'`.
12. **Blanket List Scraping**: Running `list` on `/leads` or `/businesses` without matching `resource.data.ownerId == request.auth.uid`.
