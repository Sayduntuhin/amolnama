# Security Specification - Project Management System

## 1. Data Invariants
- A **Project** must have an `ownerId` matching the creator's UID.
- A **Phase** belongs to a Project and its lifecycle is tied to the Project.
- **Developers** can only be managed by the owner who created them.
- **Daily Progress** logs must reference valid Projects and Developers owned by the user.

## 2. The "Dirty Dozen" Payloads (Attack Vectors)
1. **Identity Theft**: Creating a project with someone else's `ownerId`.
2. **Ghost Project**: Creating a phase for a project ID that does not exist.
3. **Shadow Update**: Injecting an `isAdmin` field into a project document.
4. **ID Poisoning**: Using a 2MB string as a project ID to cause document bloat.
5. **State Shortcut**: Jumping a project status from 'WIP' to 'Complete' without finishing phases.
6. **PII Leak**: Querying for all user profiles (developers) without being the owner.
7. **Timestamp Spoofing**: Providing a client-side `createdAt` date from 2010.
8. **Unbounded Array**: Flooding the `phases` list with 10,000 entries.
9. **Relational Break**: Deleting a project but leaving orphaned phases.
10. **Query Scrape**: Listing all projects by removing the `ownerId` filter.
11. **Negative Value**: Setting a project amount to -$1,000,000.
12. **Recursive Cost**: Repeatedly querying a collection with expensive `get()` calls in rules.

## 3. Test Runner (Conceptual)
All上記 vectors must return `PERMISSION_DENIED`.
