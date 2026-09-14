# Balance sweep — era 3

200 games per configuration, 25 years each.

Numbers below belong to **era 3**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1178 | 1651 | 2216 |
| treasury | 2877649 | 3458673 | 4001930 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3458673, p95 **4845278**
- industrial demand median -599, p95 **210**
- residential demand median -222
- pollution over developed land 1, over the whole region 7
- crime 15, congested tiles 4, stranded homes 0

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 976 | 1490 | 2154 |
| treasury | 1770380 | 2741513 | 3285854 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2741513, p95 **3951696**
- industrial demand median -367, p95 **177**
- residential demand median -49
- pollution over developed land 1, over the whole region 7
- crime 15, congested tiles 5, stranded homes 0

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 684 | 1203 | 1875 |
| treasury | 716764 | 1091781 | 1528307 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 1091781, p95 **2076548**
- industrial demand median -61, p95 **197**
- residential demand median -29
- pollution over developed land 1, over the whole region 7
- crime 15, congested tiles 4, stranded homes 0

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 727 | 1395 | 2053 |
| treasury | 1442377 | 2589539 | 3148881 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2589539, p95 **3824556**
- industrial demand median -231, p95 **187**
- residential demand median -55
- pollution over developed land 1, over the whole region 7
- crime 15, congested tiles 4, stranded homes 0

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **3951696** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **177** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 7.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
