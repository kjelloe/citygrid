# Region sweep — era 31

200 games per arm per configuration, 25 years each, **4 seats** and one
deputy per seat on one map. Numbers below belong to **era 31**; numbers from
a previous era are void, not roughly comparable (CLAUDE.md).

**What this sweep searches for:** the spread between seats, as a percentage of the mean —
treasury, residents and land. The totals say whether the region is alive; only the spread
says whether it is fair, and fairness is the whole of what these three options change.

- `null` — the defaults: shared treasury, aid on, disaster aid off
- `split-equal` — a split treasury on the rule it always used, which is the baseline the next arm moves
- `split-population` — a split treasury divided by the residents each seat houses
- `no-mutual-aid` — a station covers its own seat's ground and the commons, and stops at a neighbour
- `disaster-aid` — the solvent seats pay for a seat's emergency relief; with it off, the faucet does

## steady-64

| arm | alive | population | treasury total | treasury spread | residents spread | land spread | seats with nobody | relief paid | levied |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `null` | 200 of 200 | 4262 | 10868873 | 1% | 110% | 71% | 0 | 0 | 0 |
| `split-equal` | 200 of 200 | 4262 | 10869289 | 1% | 110% | 71% | 0 | 0 | 0 |
| `split-population` | 200 of 200 | 4255 | 10869289 | 70% | 114% | 71% | 0 | 0 | 0 |
| `no-mutual-aid` | 200 of 200 | 4087 | 9726154 | 1% | 119% | 69% | 0 | 0 | 0 |
| `disaster-aid` | 200 of 200 | 4262 | 10868873 | 1% | 110% | 71% | 0 | 0 | 0 |

## demanding-64

| arm | alive | population | treasury total | treasury spread | residents spread | land spread | seats with nobody | relief paid | levied |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `null` | 200 of 200 | 3905 | 6135868 | 2% | 100% | 64% | 0 | 43 | 0 |
| `split-equal` | 200 of 200 | 3905 | 6181849 | 2% | 102% | 64% | 0 | 43 | 0 |
| `split-population` | 200 of 200 | 3914 | 6056569 | 71% | 106% | 69% | 0 | 65 | 0 |
| `no-mutual-aid` | 200 of 200 | 3834 | 5218552 | 2% | 113% | 67% | 0 | 77 | 0 |
| `disaster-aid` | 200 of 200 | 3909 | 6135868 | 2% | 100% | 64% | 0 | 43 | 43589 |

## What moved

- **`split-equal`**: population 4262 → 4262 (=0), treasuryTotal 10868873 → 10869289 (+416), treasurySpread 1% → 1% (=0%), residentsSpread 110% → 110% (=0%)
- **`split-population`**: population 4262 → 4255 (-7), treasuryTotal 10868873 → 10869289 (+416), treasurySpread 1% → 70% (+69%), residentsSpread 110% → 114% (+4%)
- **`no-mutual-aid`**: population 4262 → 4087 (-175), treasuryTotal 10868873 → 9726154 (-1142719), treasurySpread 1% → 1% (=0%), residentsSpread 110% → 119% (+9%)
- **`disaster-aid`**: population 4262 → 4262 (=0), treasuryTotal 10868873 → 10868873 (=0), treasurySpread 1% → 1% (=0%), residentsSpread 110% → 110% (=0%)

## Does every arm reach a city

| arm | moved | its subject | how much of it this sample had |
| --- | --- | --- | --- |
| `split-equal` | 4 measure(s) | `residentsHoused` | 8167 of the 1 it takes to tell |
| `split-population` | 12 measure(s) | `residentsHoused` | 8176 of the 1 it takes to tell |
| `no-mutual-aid` | 14 measure(s) | `stations` | 270 of the 1 it takes to tell |
| `disaster-aid` | 2 measure(s) | `levyCount` | 99 of the 1 it takes to tell |

All 4 arms moved at least one measure on at least one configuration.

