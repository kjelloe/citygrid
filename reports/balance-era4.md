# Balance sweep — era 4

200 games per configuration, 25 years each.

Numbers below belong to **era 4**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1257 | 1654 | 2208 |
| treasury | 2981284 | 3517942 | 4119769 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3517942, p95 **4943754**
- industrial demand median -542, p95 **213**
- residential demand median -214
- pollution over developed land 1, over the whole region 6
- crime 11, congested tiles 7, stranded homes 1

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 932 | 1671 | 2193 |
| treasury | 1831631 | 2642143 | 3147011 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2642143, p95 **3915982**
- industrial demand median -382, p95 **169**
- residential demand median -100
- pollution over developed land 1, over the whole region 6
- crime 11, congested tiles 6, stranded homes 1

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 641 | 1039 | 1802 |
| treasury | 628667 | 890269 | 1391882 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **3**
- peak treasury median 890269, p95 **1848106**
- industrial demand median -46, p95 **195**
- residential demand median 1
- pollution over developed land 1, over the whole region 7
- crime 12, congested tiles 2, stranded homes 1

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 753 | 1394 | 2063 |
| treasury | 1449092 | 2566702 | 3143935 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2566702, p95 **4070803**
- industrial demand median -235, p95 **170**
- residential demand median -99
- pollution over developed land 1, over the whole region 7
- crime 11, congested tiles 4, stranded homes 0

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **3915982** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **169** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 6.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
