-- Montants ajustés des modèles « jour du salaire » : identifiés par le mois de paie (1er du mois)
-- et non plus par la date réelle du salaire, qui peut changer (report ponctuel, changement de règle).

create temp table payday_override_map as
select o.template_id, o.due_date, m.month_date,
       row_number() over (partition by o.template_id, m.month_date order by o.due_date desc) as rn
from public.recurring_overrides o
join public.recurring_templates t on t.id = o.template_id and t.on_payday
left join public.pay_date_overrides p on p.user_id = o.user_id and p.pay_date = o.due_date
-- Un salaire reporté dans un autre mois reste rattaché à son mois de paie.
cross join lateral (
  select coalesce(to_date(p.month || '-01', 'YYYY-MM-DD'), date_trunc('month', o.due_date)::date) as month_date
) m;

-- Doublons d'un même mois : on garde l'ajustement à la date la plus récente.
delete from public.recurring_overrides o
using payday_override_map m
where m.rn > 1 and o.template_id = m.template_id and o.due_date = m.due_date;

update public.recurring_overrides o
set due_date = m.month_date
from payday_override_map m
where m.rn = 1 and o.template_id = m.template_id and o.due_date = m.due_date and o.due_date <> m.month_date;

drop table payday_override_map;
