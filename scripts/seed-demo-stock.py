"""Demo stock for a development database: bins, bags, hand-outs, corrections.

    python3 scripts/seed-demo-stock.py                     # local
    python3 scripts/seed-demo-stock.py closetkeeper-dev maincloud

Deliberately uneven. A closet where every size holds the same number of
things is a closet nobody has used, and the point of the shelves screen is
to show where it is thin.

Never point this at production. It calls the same reducers a person would,
so everything it writes is real: real movements, real audit rows, and no way
to tell them apart afterwards except by the dates. The database name is
required for anything but the local instance, and a name without a "-dev" or
"-local" suffix has to be confirmed.
"""
import json, random, subprocess, sys

DB = sys.argv[1] if len(sys.argv) > 1 else "closetkeeper-local"
SERVER = sys.argv[2] if len(sys.argv) > 2 else "local"
BASE = ["--server", SERVER] + ([] if SERVER == "maincloud" else ["--no-config"])

if not ("-dev" in DB or "-local" in DB or "-test" in DB):
    answer = input(f"{DB!r} does not look like a development database. Type the name again to continue: ")
    if answer.strip() != DB:
        sys.exit("stopped")

def sql(q):
    out = subprocess.run(["spacetime", "sql", DB, *BASE, "--format", "json", q],
                         capture_output=True, text=True).stdout
    return json.loads(out)[0]["rows"]

def call(name, *args):
    r = subprocess.run(["spacetime", "call", DB, *BASE, name, *[json.dumps(a) for a in args]],
                       capture_output=True, text=True)
    err = [l for l in r.stderr.splitlines() if "UNSTABLE" not in l and l.strip()]
    return "\n".join(err)

random.seed(20260906)

locs = {l: i for l, i in sql("SELECT label, location_id FROM location_options")}
for name in ["Rack A", "Bin 1", "Bin 2", "Bin 3", "Bin 4", "Shoe rack"]:
    if name not in locs:
        e = call("add_location", name)
        if e:
            print("bin", name, "->", e[:100])
locs = {l: i for l, i in sql("SELECT label, location_id FROM location_options")}

cats = {l: i for l, i in sql("SELECT label, category_id FROM category_options")}
scales = {k: i for i, k in sql("SELECT scale_id, key FROM scale_options")}
sizes = sql("SELECT size_id, label, scale_id FROM size_options")
gend = {l: i for l, i in sql("SELECT label, gender_id FROM gender_options")}
cond = {l: i for l, i in sql("SELECT label, condition_id FROM condition_options")}

clothing = [(i, l) for i, l, s in sizes if s == scales["clothing"]]
shoe = [(i, l) for i, l, s in sizes if s == scales["shoes"]]
diaper = [(i, l) for i, l, s in sizes if s == scales["diapers"]]

# Which bin a category and size tend to live in, so the suggestion has
# something true to suggest and bins are not a uniform smear.
def home(cat, label):
    if cat == "Shoes": return locs["Shoe rack"]
    if cat in ("Dresses", "Outerwear"): return locs["Rack A"]
    if cat in ("Socks", "Underwear"): return locs["Bin 1"]
    if label in ("2T", "3T", "12m", "18m", "24m"): return locs["Bin 2"]
    if label in ("4T", "5", "6"): return locs["Bin 3"]
    return locs["Bin 4"]

# How well stocked each category is. Toddler sizes are what a closet has
# most of, and coats are always thin.
DENSITY = {"Tops": .85, "Bottoms": .8, "Pajamas": .5, "Underwear": .45,
           "Socks": .55, "Dresses": .35, "Outerwear": .3, "Shoes": .4, "Diapers": .5}
def hot(label):
    return 2.0 if label in ("2T", "3T", "4T", "5", "6") else (
        1.3 if label in ("12m", "18m", "24m", "7", "8") else 0.7)

def lines_for(cat):
    pool = shoe if cat == "Shoes" else diaper if cat == "Diapers" else clothing
    out = []
    for sid, label in pool:
        if random.random() > DENSITY[cat] * min(1.0, hot(label) * 0.55):
            continue
        g = random.choice(["Boys", "Girls", "Neutral", "Boys", "Girls"])
        c = random.choice(["Good", "Good", "Good", "New", "Worn"])
        out.append((cats[cat], sid, gend[g], cond[c], home(cat, label),
                    max(1, int(random.gauss(3.5 * hot(label), 2)))))
    return out

BAGS = [
    ("donated", ["Tops", "Bottoms"]),
    ("donated", ["Pajamas", "Socks", "Underwear"]),
    ("donated", ["Tops", "Dresses"]),
    ("purchased", ["Underwear", "Socks"]),
    ("donated", ["Outerwear", "Shoes"]),
    ("donated", ["Bottoms", "Tops"]),
    ("donated", ["Diapers"]),
    ("purchased", ["Shoes"]),
    ("donated", ["Tops", "Bottoms", "Pajamas"]),
]

made = 0
for kind, categories in BAGS:
    if call("open_bag", kind, ""):
        continue
    bag = max(b for b, s in sql("SELECT bag_id, status FROM bag_list") if s == "open")
    n = 0
    for cat in categories:
        for args in lines_for(cat):
            if not call("add_bag_line", bag, *args):
                n += 1
    call("close_bag", bag)
    made += 1
    print(f"bag {made}/{len(BAGS)} ({kind}): {n} lines", flush=True)

# An appointment's worth of hand-outs, then a couple of recounts, so the
# ledger has more in it than intake.
stock = sql("SELECT slot_id, on_hand FROM shelves")
random.shuffle(stock)
handed = 0
for slot, on_hand in stock[:40]:
    if on_hand < 2:
        continue
    bins = [(l, n) for s, l, n in sql(
        f"SELECT slot_id, location_id, on_hand FROM bin_levels WHERE slot_id = {slot}") if n > 0]
    if not bins:
        continue
    loc, have = bins[0]
    take = min(have, random.randint(1, 2))
    if not call("hand_out", slot, loc, take, ""):
        handed += take

corrected = 0
for slot, on_hand in stock[40:46]:
    bins = [(l, n) for s, l, n in sql(
        f"SELECT slot_id, location_id, on_hand FROM bin_levels WHERE slot_id = {slot}") if n > 0]
    if not bins:
        continue
    loc, have = bins[0]
    if not call("correct_count", slot, loc, max(0, have - 1), "counted the bin"):
        corrected += 1

total = sum(r[0] for r in sql("SELECT on_hand FROM shelves"))
print(f"done: {made} bags, {handed} handed out, {corrected} corrections, {total} on the shelves")
