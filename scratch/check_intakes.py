import sqlite3

con = sqlite3.connect('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite')
cur = con.cursor()

print('=== work_order_intakes ===')
for r in cur.execute("SELECT id, source, external_id, status, blocking_count, data_json FROM work_order_intakes").fetchall():
    print(r)

print('\n=== website_intake_submissions ===')
for r in cur.execute("SELECT id, external_submission_id, workflow, status, contact_name, contact_email, contact_phone, company_name, message FROM website_intake_submissions").fetchall():
    print(r)
