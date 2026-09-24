# Balance sweep — era 5

200 games per configuration, 25 years each.

Numbers below belong to **era 5**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1247 | 1706 | 2304 |
| treasury | 3029930 | 3568908 | 4115031 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 3568908, p95 **4859090**
- industrial demand median -534, p95 **277**
- residential demand median -226
- pollution over developed land 1, over the whole region 6
- crime 11, congested tiles 5, stranded homes 1

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 734 | 1343 | 1946 |
| treasury | 1517158 | 2541714 | 3103945 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2541714, p95 **3825108**
- industrial demand median -277, p95 **220**
- residential demand median -124
- pollution over developed land 1, over the whole region 6
- crime 11, congested tiles 4, stranded homes 0

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 653 | 1118 | 1851 |
| treasury | 647725 | 940372 | 1384714 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **2**
- peak treasury median 940753, p95 **1898390**
- industrial demand median -46, p95 **165**
- residential demand median -23
- pollution over developed land 1, over the whole region 7
- crime 12, congested tiles 2, stranded homes 1

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 785 | 1510 | 2163 |
| treasury | 1560625 | 2680583 | 3258872 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2680583, p95 **4128124**
- industrial demand median -317, p95 **141**
- residential demand median -119
- pollution over developed land 1, over the whole region 7
- crime 11, congested tiles 6, stranded homes 1

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **3825108** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **220** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 6.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
