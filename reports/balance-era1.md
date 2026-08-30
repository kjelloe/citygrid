# Balance sweep — era 1

200 games per configuration, 25 years each.

Numbers below belong to **era 1**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 832 | 1339 | 2018 |
| treasury | 1904889 | 2816728 | 3734015 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2816728, p95 **4786007**
- industrial demand median -435, p95 **336**
- residential demand median -20
- pollution over developed land 1, over the whole region 8
- crime 16, congested tiles 8, stranded homes 1

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 647 | 1179 | 2041 |
| treasury | 974704 | 1948892 | 2945638 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **5**
- peak treasury median 1948892, p95 **3767697**
- industrial demand median -257, p95 **294**
- residential demand median 0
- pollution over developed land 1, over the whole region 8
- crime 16, congested tiles 7, stranded homes 0

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 132 | 766 | 1629 |
| treasury | 40 | 638850 | 1187027 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **31**
- peak treasury median 653449, p95 **2015695**
- industrial demand median -17, p95 **288**
- residential demand median 39
- pollution over developed land 1, over the whole region 8
- crime 15, congested tiles 0, stranded homes 0

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 732 | 1364 | 2047 |
| treasury | 1134295 | 2031959 | 2983513 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 2031959, p95 **3838215**
- industrial demand median -328, p95 **325**
- residential demand median 1
- pollution over developed land 1, over the whole region 8
- crime 16, congested tiles 8, stranded homes 0

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **3767697** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **294** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 8.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
