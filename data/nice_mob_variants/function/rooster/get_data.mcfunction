execute unless predicate nice_mob_variants:percentages/33 run return fail

data modify storage eden:temp nice_mob_variants.age set from entity @s

execute unless data entity @s data.nice_mob_variants.crow_pitch run function nice_mob_variants:rooster/set_pitch
execute if predicate nice_mob_variants:entity/is_adult run function nice_mob_variants:rooster/exec with entity @s data.nice_mob_variants

data remove storage eden:temp nice_mob_variants.age