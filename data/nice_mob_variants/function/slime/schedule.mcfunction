execute as @a[tag=nice_mob_variants.raycast_slime] at @s anchored eyes positioned ^ ^ ^0 run function nice_mob_variants:slime/raycast
execute as @e[type=#nice_mob_variants:can_become_slime_variant,tag=nice_mob_variants.raycast_slime_target,limit=1] at @s run function nice_mob_variants:slime/exec

tag @e remove nice_mob_variants.raycast_slime
tag @e remove nice_mob_variants.raycast_slime_target