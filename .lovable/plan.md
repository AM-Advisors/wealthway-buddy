# Connect a Plaid demo bank account on the walkthrough fund

## Goal

Show the Banking tab working end to end on the "Harmonious Walkthrough Fund" using one of Plaid's built-in demo bank accounts, so you can see the connect flow, the account details, and demo transactions you can assign to investors.

## How it works today

- Each fund's Banking tab already has a **Connect bank** button that opens Plaid's sign-in window.
- Plaid has a free demo mode ("sandbox") with pretend banks and ready-made demo sign-ins (username `user_good`, password `pass_good`) that return realistic balances and transactions.
- The app is set to use Plaid's demo mode unless a setting switches it to live mode. That setting is stored encrypted, so the first step is simply trying it.

## Plan

1. **Try the demo as-is (no changes).** Sign in as the test fund manager, open the walkthrough fund's Banking tab, click **Connect bank**, pick Plaid's demo bank ("First Platypus Bank") and sign in with the demo credentials.
2. **If it connects:** done — no code changes. The Banking tab will show the demo account and its transactions, and you can assign investors to the demo wires. I'll confirm it all shows correctly in the preview.
3. **If it's in live mode and the demo sign-in is rejected:** add a **"Connect Plaid demo bank"** button that appears only on test funds (never on real client funds). It would connect through Plaid's demo mode using separate demo credentials, leaving the live connection untouched for real funds. This needs your Plaid demo (sandbox) keys, which I'd ask for through a secure form.

## Notes

- A demo connection is read-only and moves no money, same as a real one.
- Demo transactions are pretend data from Plaid; nothing touches real client records.
- If step 3 is needed, real funds keep using live Plaid exactly as they do now.
