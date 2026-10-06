# Balance sweep — era 29

200 games per configuration, 25 years each.

Numbers below belong to **era 29**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1514 | 1811 | 2245 |
| treasury | 5006035 | 5620958 | 6117644 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5620958, p95 **6712162**
- industrial demand median -145, p95 **-1**
- residential demand median -171
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 14, stranded homes 16
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1494 | 1710 | 2186 |
| treasury | 3596926 | 3953931 | 4343964 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3953931, p95 **4954993**
- industrial demand median -110, p95 **-1**
- residential demand median -76
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 15, stranded homes 14
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 2 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1427 | 1545 | 1827 |
| treasury | 1797600 | 2121013 | 2390186 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2121013, p95 **2731574**
- industrial demand median -50, p95 **25**
- residential demand median -62
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 11
- land value over developed land: p25 133, median **136**, p75 140
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 1 — in 2 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1476 | 1572 | 1978 |
| treasury | 3555618 | 3952649 | 4324149 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3952649, p95 **4857871**
- industrial demand median -61, p95 **16**
- residential demand median -69
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 13, stranded homes 14
- land value over developed land: p25 135, median **138**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4954993** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **-1** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
