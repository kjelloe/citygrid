# Balance sweep — era 17

200 games per configuration, 25 years each.

Numbers below belong to **era 17**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1490 | 1766 | 2062 |
| treasury | 5732435 | 6153930 | 6610997 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 6153930, p95 **7214378**
- industrial demand median -132, p95 **16**
- residential demand median -147
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 9
- land value over developed land: p25 133, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1483 | 1589 | 1926 |
| treasury | 4303306 | 4719054 | 5049060 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4719054, p95 **5505210**
- industrial demand median -65, p95 **19**
- residential demand median -69
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 9, stranded homes 9
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 6, water median 0 p95 3 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1375 | 1518 | 1787 |
| treasury | 1939973 | 2174310 | 2496078 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 2174310, p95 **2812676**
- industrial demand median -47, p95 **20**
- residential demand median -57
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 8, stranded homes 8
- land value over developed land: p25 132, median **135**, p75 138
- power grid 3 components; dark buildings: power median 1 p95 12, water median 0 p95 4 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1490 | 1565 | 1928 |
| treasury | 4332053 | 4712114 | 5045187 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4712114, p95 **5668819**
- industrial demand median -55, p95 **3**
- residential demand median -65
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 9
- land value over developed land: p25 135, median **138**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5505210** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **19** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
