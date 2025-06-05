select userSf, count(1) as friendliness
from (
  select userasf as userSf from Acquaintance where guildsf = :guildsf
  union all
  select userbsf as userSf from Acquaintance where guildsf = :guildsf
)
group by userSf
order by friendliness desc
limit 10;
