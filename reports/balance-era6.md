# Balance sweep — era 6

200 games per configuration, 25 years each.

Numbers below belong to **era 6**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1615 | 2042 | 2514 |
| treasury | 4019636 | 4644518 | 5107353 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4644518, p95 **5769735**
- industrial demand median -504, p95 **112**
- residential demand median -287
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 8, stranded homes 1

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1387 | 1902 | 2458 |
| treasury | 2963892 | 3527740 | 4060439 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3527740, p95 **4845139**
- industrial demand median -369, p95 **277**
- residential demand median -293
- pollution over developed land 2, over the whole region 6
- crime 12, congested tiles 9, stranded homes 1

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1106 | 1726 | 2373 |
| treasury | 1137854 | 1659264 | 2085113 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1659264, p95 **2565681**
- industrial demand median -256, p95 **178**
- residential demand median -92
- pollution over developed land 1, over the whole region 6
- crime 12, congested tiles 6, stranded homes 2

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1395 | 2024 | 2506 |
| treasury | 2669249 | 3546344 | 3977540 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3546344, p95 **4839321**
- industrial demand median -408, p95 **102**
- residential demand median -196
- pollution over developed land 1, over the whole region 6
- crime 11, congested tiles 9, stranded homes 1

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4845139** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **277** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 6.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
