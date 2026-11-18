import sqlite3

con = sqlite3.connect('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite')
cur = con.cursor()

print('=== work_orders for WO-DME-2026-002 ===')
for r in cur.execute("SELECT id, external_id, status, scheduled_start FROM work_orders WHERE external_id = 'WO-DME-2026-002'").fetchall():
    print(r)

print('\n=== work_order_assignments for WO-DME-2026-002 ===')
for r in cur.execute("SELECT wa.id, wa.work_order_id, wa.technician_id, wa.role, wa.status, t.technician_code, u.display_name FROM work_order_assignments wa JOIN technicians t ON t.id = wa.technician_id JOIN users u ON u.id = t.user_id WHERE wa.work_order_id IN (SELECT id FROM work_orders WHERE external_id = 'WO-DME-2026-002')").fetchall():
    print(r)

print('\n=== route_stops for WO-DME-2026-002 ===')
for r in cur.execute("SELECT rs.id, rs.route_id, rs.stop_order, r.route_date, r.technician_id FROM route_stops rs JOIN routes r ON r.id = rs.route_id WHERE rs.work_order_id IN (SELECT id FROM work_orders WHERE external_id = 'WO-DME-2026-002')").fetchall():
    print(r)
