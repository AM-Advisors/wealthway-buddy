## Thomas's lost SPV answers

**What we found:** No copy of Thomas's SPV answers was ever saved. Every save attempt failed, so his answers only existed in his open browser tab, and the refresh erased them. They can't be recovered.

**Plan**
1. Ask Thomas to open Add Fund or SPV again and enter his answers.
2. As soon as he starts typing, check that a saved copy shows up within a few seconds. If it doesn't, fix the saving problem before he goes any further.
3. Add a backup copy kept in his browser while he types, so a refresh or dropped connection can't erase his answers again, even when saving fails. When the page reopens it offers to restore that copy.
4. Show a clear "Not saved, retrying" warning whenever saving fails, so the page never claims his answers are saved when they aren't.

**Technical details**
- Store the backup in localStorage under the user and client, and clear it after a successful save or submit.
- Restore it only once the page is loaded in the browser, to avoid errors when the page first draws.
- Add tests for restoring the backup and for the failed-save warning.
