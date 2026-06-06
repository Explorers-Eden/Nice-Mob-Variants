schedule function nice_mob_variants:sulfur_cube/init 1s

execute as @e[type=minecraft:sulfur_cube,tag=!nmv.is_balloon] if items entity @s armor.body #nice_mob_variants:glass if data entity @s leash run function nice_mob_variants:sulfur_cube/balloon/add/init
execute as @e[type=minecraft:sulfur_cube,tag=nmv.is_balloon] unless items entity @s armor.body #nice_mob_variants:glass run function nice_mob_variants:sulfur_cube/balloon/remove
execute as @e[type=minecraft:sulfur_cube,tag=nmv.is_balloon] unless data entity @s leash run function nice_mob_variants:sulfur_cube/balloon/remove
