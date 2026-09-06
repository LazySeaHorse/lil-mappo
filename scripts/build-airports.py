import urllib.request
import csv
import io
import json
import os

URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"

def build():
    print("Fetching OpenFlights airports data...")
    req = urllib.request.urlopen(URL)
    content = req.read().decode("utf-8")

    reader = csv.reader(io.StringIO(content))
    airports = []
    for row in reader:
        if len(row) < 14:
            continue
        iata = row[4].strip()
        icao = row[5].strip()
        atype = row[12].strip().lower()

        has_iata = iata != "\\N" and len(iata) == 3
        has_icao = icao != "\\N" and len(icao) == 4

        if (has_iata or has_icao) and atype == "airport":
            name = row[1].strip()
            city = row[2].strip()
            country = row[3].strip()
            try:
                lat = round(float(row[6]), 4)
                lng = round(float(row[7]), 4)
                airports.append([
                    iata if has_iata else "",
                    icao if has_icao else "",
                    name,
                    city,
                    country,
                    lng,
                    lat
                ])
            except ValueError:
                pass

    out_dir = os.path.join(os.path.dirname(__file__), "..", "src", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "airports.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(airports, f, separators=(",", ":"), ensure_ascii=False)

    print(f"Generated {out_path} with {len(airports)} airports ({os.path.getsize(out_path):,} bytes).")

if __name__ == "__main__":
    build()
