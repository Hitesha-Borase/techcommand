import sqlite3

con = sqlite3.connect('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite')
cur = con.cursor()

for table in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    tname = table[0]
    try:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tname})").fetchall()]
        for col in cols:
            res = cur.execute(f"SELECT * FROM {tname} WHERE cast({col} as text) LIKE '%40c0c8c6%'").fetchall()
            if res:
                print(f"Found in {tname}.{col}:", res)
    except Exception as e:
        pass
