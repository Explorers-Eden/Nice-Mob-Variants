schedule function nice_mob_variants:glow/init 10t

execute as @e[type=#nice_mob_variants:possible_for_glow_variant] at @s if predicate nice_mob_variants:entity/is_glow_variant run function nice_mob_variants:glow/setblock
execute as @e[type=marker,tag=mob_variants.light] at @s unless entity @e[type=area_effect_cloud,tag=mob_variants.light,distance=..0.5] unless entity @e[type=#nice_mob_variants:possible_for_glow_variant,distance=..0.5] run function nice_mob_variants:glow/remove