schedule function nice_mob_variants:skeleton_trap/init 11t

execute as @e[type=minecraft:skeleton_horse,tag=!nice_mob_variants.is_trap,predicate=nice_mob_variants:entity/is_skeleton_trap] at @s run function nice_mob_variants:skeleton_trap/spawn/init
execute as @e[type=#nice_mob_variants:is_custom_trap,predicate=nice_mob_variants:entity/is_skeleton_variant,predicate=nice_mob_variants:entity/is_skeleton_trap] at @s if entity @e[type=player,distance=..10] run function nice_mob_variants:skeleton_trap/exec_trap with entity @s data

execute as @e[type=#nice_mob_variants:is_custom_trap,predicate=nice_mob_variants:entity/is_skeleton_variant] run data modify entity @s Age set value 2400