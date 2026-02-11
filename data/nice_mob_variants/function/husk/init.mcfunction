schedule function nice_mob_variants:husk/init 1s

execute as @e[type=minecraft:zombie_nautilus,tag=!mob_variants.is_husk,predicate=nice_mob_variants:entity/is_husk_variant] run function nice_mob_variants:husk/exec