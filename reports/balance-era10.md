# Balance sweep — era 10

200 games per configuration, 25 years each.

Numbers below belong to **era 10**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1860 | 2435 | 2956 |
| treasury | 4798971 | 5784830 | 6485079 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5784830, p95 **7506395**
- industrial demand median -493, p95 **197**
- residential demand median -221
- pollution over developed land 2, over the whole region 5
- crime 6, congested tiles 10, stranded homes 5

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1750 | 2427 | 2880 |
| treasury | 3477567 | 4488197 | 4985764 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 4488197, p95 **5930598**
- industrial demand median -441, p95 **284**
- residential demand median -167
- pollution over developed land 2, over the whole region 5
- crime 6, congested tiles 13, stranded homes 5

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1316 | 1881 | 2526 |
| treasury | 1346121 | 1983244 | 2497915 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1983244, p95 **3068715**
- industrial demand median -260, p95 **214**
- residential demand median -45
- pollution over developed land 1, over the whole region 5
- crime 7, congested tiles 9, stranded homes 3

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1858 | 2347 | 2954 |
| treasury | 3789122 | 4655045 | 5161841 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4655045, p95 **5868504**
- industrial demand median -325, p95 **260**
- residential demand median -283
- pollution over developed land 2, over the whole region 5
- crime 6, congested tiles 13, stranded homes 5

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5930598** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **284** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 5.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
