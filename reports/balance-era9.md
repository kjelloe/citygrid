# Balance sweep — era 9

200 games per configuration, 25 years each.

Numbers below belong to **era 9**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1837 | 2369 | 2937 |
| treasury | 4649441 | 5552448 | 6145447 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5552448, p95 **7114848**
- industrial demand median -462, p95 **445**
- residential demand median -230
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 8, stranded homes 2

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1605 | 2317 | 2980 |
| treasury | 3549878 | 4316190 | 4745775 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 4316190, p95 **5484601**
- industrial demand median -387, p95 **335**
- residential demand median -164
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 9, stranded homes 2

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1214 | 1969 | 2583 |
| treasury | 1447018 | 2167452 | 2497264 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **4**
- peak treasury median 2167452, p95 **2949136**
- industrial demand median -240, p95 **357**
- residential demand median -50
- pollution over developed land 1, over the whole region 6
- crime 12, congested tiles 6, stranded homes 2

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1870 | 2501 | 3167 |
| treasury | 3596298 | 4533616 | 5076700 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4533616, p95 **5884640**
- industrial demand median -396, p95 **280**
- residential demand median -249
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 8, stranded homes 2

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5484601** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **335** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 6.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
