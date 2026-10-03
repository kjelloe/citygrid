# Balance sweep — era 18

200 games per configuration, 25 years each.

Numbers below belong to **era 18**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1519 | 1842 | 2192 |
| treasury | 5949895 | 6302601 | 6615422 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 6302601, p95 **7224496**
- industrial demand median -167, p95 **23**
- residential demand median -124
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 10
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1487 | 1571 | 1888 |
| treasury | 4255864 | 4682920 | 5022839 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4682920, p95 **5515844**
- industrial demand median -72, p95 **0**
- residential demand median -75
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 8, stranded homes 9
- land value over developed land: p25 133, median **136**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 5, water median 0 p95 3 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1474 | 1551 | 1804 |
| treasury | 2117771 | 2316300 | 2540669 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2316300, p95 **2939273**
- industrial demand median -58, p95 **14**
- residential demand median -64
- pollution over developed land 1, over the whole region 5
- crime 1, congested tiles 8, stranded homes 7
- land value over developed land: p25 131, median **135**, p75 139
- power grid 3 components; dark buildings: power median 1 p95 7, water median 0 p95 3 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1488 | 1569 | 1927 |
| treasury | 4487856 | 4842109 | 5191030 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4842109, p95 **5703866**
- industrial demand median -69, p95 **9**
- residential demand median -65
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 9
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5515844** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **0** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
