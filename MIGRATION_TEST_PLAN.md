# Dexie v4/v5 migration test plan

Use a disposable browser profile or copied IndexedDB database. Never use the only copy of a populated vault.

Before upgrade, record store counts, document IDs/content lengths, asset IDs/names/MIME types/Blob byte lengths, and project root-folder references.

After upgrade, assert:
1. Database schema version is 5 and collections object store is absent.
2. Documents/assets have no collectionId; folders have no legacyCollectionId.
3. All previous documents/assets remain with identical primary keys.
4. Document content, tags, timestamps, and bookmark state are unchanged.
5. Asset metadata and Blob byte lengths are unchanged.
6. Former collection assignments resolve to folders in the same workspace.
7. Existing custom folder assignments remain unchanged when valid in the same workspace.
8. Project roots and nested folder relationships remain valid.
9. A second workspace cannot see another workspace's folders, documents, or assets.

Pass only when counts and Blob sizes match the snapshot and all references are workspace-local.
