# Sheikh Amjad Karyana Store - Khata

Customer credit (udhaar) ledger for a grocery shop. Original design, built from scratch with plain HTML, CSS and JavaScript. Hosted free on GitHub Pages. Data and logins are handled by Supabase.

## Features
- Customer records with name, phone and address
- Purchases with items, total bill and amount paid
- Later payments, with the pending balance calculated automatically
- Extra payment is shown as an advance (shop owes the customer)
- Search by name or phone, filters for Pending, Advance and Clear
- Dashboard with total receivable and customer counts
- Two logins. Every entry shows who added or edited it
- Excel backup with filters, and a reminder every 5 days

## Setup
1. Create a Supabase project and run `setup.sql` in the SQL Editor.
2. Turn off public sign ups and create the two users in Authentication.
3. Put the Project URL and publishable key in `js/config.js`.
4. Open the site through a local server or GitHub Pages. Opening `index.html` by double click will not work.

Never put a Supabase `secret` or `service_role` key in this repo. Never upload backup files here.

## Author
Sohaib Younas, HU Digital
- Portfolio: https://sohaibyounas076.github.io/portfolio/
- GitHub: https://github.com/Sohaibyounas076/
- for using free tools : utilvance.com
